sqlite.remote

A Python based web service to allow remote access to an sqlite table.

Requirements: 

    Python 3
    Flask
    
    Should work on any system the supports Python 3. 
    

To install:

Generally expect to be installed on a Raspberry PI with default Python 3 installed. 

Clone this repo to your device. 
    
    ./install.sh 

to install dependencies, or install manually. 

Usage:

This app does not implement any type of security. 
The recommended usage is as follows:
    
    1. Start app pointing to desired database
    2. Perform maintenance
    3. Shutdown app
    
It is not recommended that this app be left running on your device. 

 To start:
  
    python3 api <db.file> 

To exit -- CTRL-C. 