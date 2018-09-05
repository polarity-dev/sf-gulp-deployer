# sf-gulp-deployer

An easy to use gulp integration to deploy static webapp on AWS S3.

## Usage

```javascript
const gulp = require("gulp")
const path = require("path")
const sfGulpDeployer = require("sf-gulp-deployer")

const options = {
  envs: ["staging", "production"],
  folder: path.join(__dirname, "build"),
  bucket: "bucket",
  prefix: env => `folder/website${env === "staging" ? "-staging" : ""}/app`
}

sfGulpDeployer(gulp, options)
```

## Tasks

- `gulp help` show commands help.
- `gulp configure` configure AWS Credentials for deployment. You must have S3:PutObject, S3:ListObjects and S3:DeleteObject permissions.
- `gulp deploy` deploy the current project using specified config. Create a git tag and increment package.json version if requested.
