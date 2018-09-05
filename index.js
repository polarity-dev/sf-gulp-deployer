/* eslint-disable no-console */
const inquirer = require("inquirer")
const AWS = require("aws-sdk")
const { join } = require("path")
const { writeFileSync } = require("fs")
const shell = require("shelljs")
const fs = require("fs")
const path = require("path")
const mime = require("mime-types")
const { readdirSync, readFileSync } = fs
const help = require("gulp-help-doc")
const cwd = process.cwd()

const dig = folder => {
  return readdirSync(folder).reduce((acc, file) => {
    if (fs.lstatSync(path.join(folder, file)).isDirectory()) {
      acc.push(...dig(path.join(folder, file)))
    } else {
      acc.push(`${folder}/${file}`)
    }
    return acc
  }, [])
}

let credentials
try {
  credentials = require(join(cwd, ".aws-credentials.json"))
} catch(_) {
  credentials = {}
}
module.exports = (gulp, { bucket, prefix, folder, envs }) => {
  /**
   * Show commands help.
   * @task {help}
   * @order {0}
   */
  gulp.task("help", () => help(gulp))

  /**
   * Configure AWS Credentials for deployment. You must have S3:PutObject, S3:ListObjects and S3:DeleteObject permissions.
   * @task {configure}
   * @order {10}
   */
  gulp.task("configure", next => {
    const { accessKeyId: prevAccessKeyId, secretAccessKey: prevSecretAccessKey } = credentials
    const hide = text => !text ? "" : `${"*".repeat(text.length - 4)}${text.substr(-4)}`

    inquirer.prompt([
      { type: "input", name: "accessKeyId", message: `accessKeyId: [${hide(prevAccessKeyId)}]` },
      { type: "input", name: "secretAccessKey", message: `secretAccessKey: [${hide(prevSecretAccessKey)}]` }
    ])
      .then(({ accessKeyId, secretAccessKey }) => {
        if (!accessKeyId) accessKeyId = prevAccessKeyId
        if (!secretAccessKey) secretAccessKey = prevSecretAccessKey
        writeFileSync(join(cwd, ".aws-credentials.json"), JSON.stringify({ accessKeyId, secretAccessKey }, null, 2))
        try {
          const gitignore = readFileSync(join(cwd, ".gitignore")).toString()
          if (!gitignore.includes(".aws-credentials.json")) {
            writeFileSync(join(cwd, ".gitignore"), `${gitignore}.aws-credentials.json`)
          }
        } catch(_) {
          writeFileSync(join(cwd, ".gitignore"), ".aws-credentials.json")
        }
        next()
      })
      .catch(next)
  })

  /**
   * Deploy the current project using specified config. Create a git tag and increment package.json version if requested.
   * @task {deploy}
   * @order {20}
   */
  gulp.task("deploy", () => {
    const pkg = require("./package.json")
    const { version: currentVersion } = pkg
    return inquirer.prompt([
      { type: "list", name: "action", message: `package.json version is ${currentVersion}. What do you want to do?`, choices: [
        { name: "Increment package.json version, publish a new git tag and deploy", value: 1 },
        { name: "Override git tag and deploy", value: 2 },
        { name: "Deploy", value: 3 }
      ], default: 0 },
      { type: "confirm", name: "confirm", message: "This will delete the current deployed version. Are you sure?", default: false }
    ])
      .then(({ confirm, action }) => {
        if (!confirm) return
        return inquirer.prompt([{ type: "list", name: "env", message: "Env:", choices: envs.map(env => ({ name: env, value: env })), default: 0 }])
          .then(({ env }) => ({ env, action }))
      })
      .then(({ env, action }) => {
        const s3 = new AWS.S3({ credentials })
        let version = currentVersion
        if (action === 1) {
          const newVersion = currentVersion.split(".").map((item, i) => i === 1 ? parseInt(item) + 1 : item).join(".")
          pkg.version = newVersion
          fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2))
          console.log(`package.json version updated to ${newVersion}`)
          version = newVersion
        }
        if (action === 1 || action === 2) {
          if (action === 2) {
            shell.exec(`git tag -d v${version}`)
          }
          shell.exec(`git tag -a v${version} -m "deployment version ${version}"`)
          console.log(`Git tag for the current version (${version}) created`)
        }
        return s3.listObjects({
          Bucket: bucket,
          Prefix: prefix(env)
        }).promise()
          .then(({ Contents }) => {
            if (Contents.length) {
              return s3.deleteObjects({
                Bucket: bucket,
                Delete: {
                  Objects: Contents.map(({ Key }) => ({ Key }))
                }
              }).promise()
            }
          })
          .then(() => {
            console.log("Uploading build folder...")
            const files = dig(folder)
            return Promise.all(files.map(file => {
              const ContentType = mime.lookup(file) || "text/plain"
              const buffer = fs.readFileSync(file)
              return s3.putObject({
                Bucket: bucket,
                Key: join(prefix(env), file.replace(`${folder}`, "")),
                Body: ContentType.split("/")[0] === "image" ? buffer : buffer.toString(),
                ContentType
              }).promise()
            }))
          })
      })
  })
}
