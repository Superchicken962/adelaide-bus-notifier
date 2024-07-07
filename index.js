const axios = require("axios");
const puppeteer = require("puppeteer");
const config = require("./config.json");
const path = require("node:path");
const fs = require("node:fs");
const { checkForStaticFilesUpdate } = require("./static_files");

// Perform daily static file checks - won't matter if process is set to terminate before then.
setInterval(checkForStaticFilesUpdate, 86400000);
checkForStaticFilesUpdate();

