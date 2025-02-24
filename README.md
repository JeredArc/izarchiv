# IZAR Archive

Program for storing measurement values with FTP upload interface for IZAR Center Memory.

## Features
- FTP server interface for receiving measurement data from IZAR Center Memory
- Stores files in SQLite database
- Handles .rdy files for marking uploads as ready
- File size limit of 50MB

## Setup
1. Clone the repository
2. Run `npm install`
3. Start the server with `npm start`

## Configuration
- FTP Port
- FTP User
- FTP Password
- Database storage file

## Usage
Upload files via FTP. Files ending in .rdy will mark their corresponding data files as ready in the database.