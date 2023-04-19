# Curious Reader Web Player
Implementation of **Curious Reader H5P** content player tool using Typescript for the Web. The project enables the playback of **H5P Curious Reader** interactive books as well as non-interactive children's books available on **[Digital Libarary](https://digitallibrary.io/)**.

## Usage
#### Building the project
The project comes with a **Webpack** config file and it requires **Webpack** for transpiling Typescript codebase into the dist **.js** file that gets included into the main index file.
Use the following command to build the project:
```
webpack
```
#### Running the project
The project currently doesn't have any back-end, so the **live-server** tool is used for emulating the back-end and hosting all the required files.
Use the following command to run the project:
```
live-server
```

## Deployment Status
Dev Deployment Status: 
[![CircleCI](https://dl.circleci.com/status-badge/img/gh/curiouslearning/CRWebPlayer/tree/develop.svg?style=svg)](https://dl.circleci.com/status-badge/redirect/gh/curiouslearning/CRWebPlayer/tree/develop)

Prod Deployment Status: 
[![CircleCI](https://dl.circleci.com/status-badge/img/gh/curiouslearning/CRWebPlayer/tree/main.svg?style=svg)](https://dl.circleci.com/status-badge/redirect/gh/curiouslearning/CRWebPlayer/tree/main)

