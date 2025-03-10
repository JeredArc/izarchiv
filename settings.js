/* Application settings */

export const dbfile = "values.db3";

/* Security isn't a concern here, as files/data can only be added via FTP, not modified or deleted. */
export const ftpconfig = {
	port: 21,
	user: "izar",
	pass: "IZAR.Center",
	pasv_min: 50000,
	pasv_max: 51000
};

export const mbusTimezoneOffset = 60; /* UTC + minutes */

export const saveUploadsInFilesystem = false;
export const uploadDirPath = "./uploads";

export default {
    dbfile,
    ftpconfig,
    mbusTimezoneOffset,
    saveUploadsInFilesystem,
    uploadDirPath
};

