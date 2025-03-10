# IZAR Archive

Program for storing measurement values with FTP upload interface for IZAR Center Memory.
(C) 2020-2022 Architekt Krizmanics ZT GmbH, Umsetzung durch Gerhard Pfister
Based on IZAR MBus Decoder (C) 2020-2022 Architekt Krizmanics ZT GmbH

## Features
- Stores files in SQLite database
- FTP server interface for receiving measurement data from IZAR Center Memory
- Handles .rdy files for marking uploads as ready

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