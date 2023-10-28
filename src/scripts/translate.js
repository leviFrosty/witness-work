/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { exec } = require("child_process");

if (!process.env.GOOGLE_TRANSLATE_API_KEY) {
  return new Error(
    "Google API key not provided. Please add GOOGLE_TRANSLATE_API_KEY to .env"
  );
}

const listFilesWithoutExtensions = (directoryPath) => {
  try {
    const files = fs.readdirSync(directoryPath);
    const fileNamesWithoutExtensions = files
      .filter((file) => fs.statSync(path.join(directoryPath, file)).isFile())
      .map((file) => path.parse(file).name);

    return fileNamesWithoutExtensions;
  } catch (error) {
    console.error("Error reading directory:", error);
    return [];
  }
};

const directoryPath = "./src/locales";
const locales = listFilesWithoutExtensions(directoryPath);
locales.forEach((locale) => {
  const nodeCommand = `i18n-auto-translation -k ${process.env.GOOGLE_TRANSLATE_API_KEY} -d "./src/locales/" -f en -t ${locale}`;

  exec(nodeCommand, (error, stdout) => {
    if (error) {
      console.error(`Error executing the command: ${error}`);
      return;
    }
    console.log(stdout);
  });
});
