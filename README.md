# IZARchiv

Program with local web interface for storing measurement values with FTP upload interface for IZAR Center Memory.
(C) 2020-2022 Architekt Krizmanics ZT GmbH, Umsetzung durch Gerhard Pfister
Based on IZAR MBus Decoder (C) 2020-2022 Architekt Krizmanics ZT GmbH

## Features
- Stores files in SQLite database
- FTP server interface for receiving measurement data from IZAR Center Memory
- Handles .rdy files for marking uploads as ready
- Web interface for viewing and managing data

## Setup
1. Clone the repository
2. Run `npm install`
3. Start the server with `npm start`

## Configuration
- FTP Port
- FTP User
- FTP Password
- Database storage file
- Web server settings
- File storage settings (in settings.js):
  - `saveUploadsInFilesystem`: Set to true to save uploads as separate files separate folder additionally to the database
  - `uploadDirPath`: Directory path for storing uploads as files (created automatically if needed)

## Directory Structure
- `public/`: Static assets for the web interface
- `views/`: EJS templates for the web interface
- `uploads/`: Directory for storing uploaded files (created automatically if `saveUploadsInFilesystem` is enabled)

## Usage
Upload files via FTP. Files ending in .rdy will mark their corresponding data files as ready in the database.
Access the web interface at `http://localhost:${webserver.port}` (as configured in settings.js).