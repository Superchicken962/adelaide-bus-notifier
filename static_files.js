const { default: axios } = require("axios");
const path = require("node:path");
const fs = require("node:fs");
const JSZip = require("jszip");
const zip = new JSZip();

const STATIC_FILES_PATH = "static_data/";

/**
 * Read content of static file. Returns empty string if file not found.
 * @param { String } filename - Name of file to read (def. 'version.txt')
 * @returns { String } Content of file - empty if no file.
 */
function readStaticFileContent(filename = "current_version.txt") {
    const filePath = path.join(__dirname, "static_data/"+filename);
    let fileContent = "";

    if (fs.existsSync(filePath)) {
        fileContent = fs.readFileSync(filePath, "utf-8");
    }

    return fileContent;
}

async function updateStaticFiles(version = "latest") {
    // Set the url with the version added.
    const downloadUrl = `https://gtfs.adelaidemetro.com.au/v1/static/${version}/google_transit.zip`;

    if (version === "latest") {
        version = await getLatestDataVersion(); // Fetch the latest version online.
    }
    const localVersion = readStaticFileContent("current_version"); // Get the current version.

    if (version === localVersion) { // If the versions match, then don't bother downloading.
        console.log("Static files are already up to date!");
        return;
    }

    // Update/download.

    await downloadZipFromURL(downloadUrl, STATIC_FILES_PATH); // wait for zip to download

    // Basically extracting the files from the zip file.
    fs.readFile(STATIC_FILES_PATH+"data.zip", (err, data) => {
        if (err) return;
        zip.loadAsync(data).then((contents) => { // Load the zip file and get the contents.
            for (const filename of Object.keys(contents.files)) { // Loop through the filenames of the content.
                zip.file(filename).async("nodebuffer").then((content) => { // Open the file and take the content of the file.
                    var destination = path.join(__dirname, STATIC_FILES_PATH+filename);
                    fs.writeFileSync(destination, content); // Save the file content into a new file.
                });
            }
        });
    });

    fs.writeFileSync(path.join(__dirname, STATIC_FILES_PATH+"current_version.txt"), version.toString(), "utf-8");

    // Log to console that we have updated the files, and shortly after we log the release notes.
    if (!localVersion) console.log(`\nStatic files have been downloaded at version ${version.toString()}!\n\n`);
    else console.log(`\nStatic files have been updated from version ${localVersion} to version ${version.toString()}!\n\n`);

    setTimeout(async() => {
        let updateNotes = readStaticFileContent("Release Notes.txt");
        console.log(updateNotes);
    }, 1250);
}

function downloadZipFromURL(url, download_path) {
    return new Promise(async(resolve, reject) => {
        const { data } = await axios.get(url, {"responseType": "stream"});

        if (!fs.existsSync(download_path)) {
            fs.mkdirSync(download_path);
        };

        data.pipe(fs.createWriteStream(download_path+"data.zip")).on("finish", () => {
            resolve();
        });    
    });
}

async function checkForStaticFilesUpdate() {
    console.log("Checking for static file updates...");

    const onlineVersion = await getLatestDataVersion();
    const localVersion = readStaticFileContent("current_version.txt");

    if (onlineVersion.toString() === localVersion.toString()) {
        console.log("Static files are up to date!");
    } else {
        console.log("Updating static files...");
        updateStaticFiles();
    }
}

function getLatestDataVersion() {
    return new Promise((resolve, reject) => {
        const versionUrl = "https://gtfs.adelaidemetro.com.au/v1/static/latest/version.txt";

        axios.get(versionUrl, {
            "responseEncoding": "utf-8",
        })
        .then((response) => {
            resolve(response.data);
        })
        .catch((error) => {
            console.log("Error retrieving latest data version", error);
            reject(error);
        });
    });
}

const findInFile = {
    routeInfoByRoute: (route, text_content) => {
        if (!text_content) text_content = readStaticFileContent("routes.txt");

        // Split by newline to get all routes, then find it by the route id (First column).
        const findRoute = text_content.split("\r\n").find(row => row.split(",")[0] === route);

        // Format data into object, taking into consideration the commas in route names.
        let second = ((findRoute.split('"'))[1]).replaceAll(",", "&#44;");
        let pre = [findRoute.split('"')[0]];
        pre.push(second);
        pre.push(findRoute.split('"')[2]);
        let final = (pre.join("")).split(",");
        const formattedRoute = {
            "route_id" : final[0],
            "agency_id" : final[1],
            "route_short_name" : final[2],
            "route_long_name" : final[3],
            "route_desc" : (final[4].replaceAll("&#44;", ",")),
            "route_type" : final[5],
            "route_url" : final[6],
            "route_color" : final[7],
            "route_text_color" : final[8],
            "RouteGroup" : final[9]
        };

        return formattedRoute;
    },
    tripInfoByTripId: (trip_id, text_content) => {
        if (!text_content) text_content = readStaticFileContent("trips.txt");
        
        let findTrip = text_content.split("\r\n").find(row => row.split(",")[2] === trip_id);
        if (!findTrip) return null;

        findTrip = findTrip.split(",");

        const formattedTrip = { // organise the values in an object
            "route_id" : findTrip[0],
            "service_id" : findTrip[1],
            "trip_id" : findTrip[2],
            "trip_headsign" : findTrip[3],
            "trip_short_name" : findTrip[4],
            "direction_id" : findTrip[5],
            "block_id" : findTrip[6],
            "shape_id" : findTrip[7],
            "wheelchair_accessible" : findTrip[8]
        };
        return formattedTrip;
    }
};

module.exports = {
    readStaticFileContent,
    checkForStaticFilesUpdate,
    findInFile
};