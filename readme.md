sqlite.remote v 1.0, March 22, 2020

There is a document [here](https://docs.google.com/document/d/1qks_uXbVdNxOkX6JgCFMinat4QRqYcPyqZqEM2Ep-8M/edit?usp=sharing) covering
latest version of this tool.

A Python based web service to allow remote access to an sqlite table. This tool is
intended to be used for light duty access of sqlite databases used in IoT devices
for logs and configuration.

Requirements: 

    Python 3
    Flask
    Flask_HTTPAuth
    Werkzeug

    This app should work on any system the supports Python 3. The latest version of Raspian Buster
    has all the requirements installed.
    

To install:

Generally expect to be installed on a Raspberry PI with default Python 3 installed. 
This script can run on Windows/Mac/Linux desktop if Python 3 is installed.  

Clone this repo to your device. Run: 
    
    ./install.sh 

to install dependencies, or install manually. 

Usage:

Please see this [document](https://docs.google.com/document/d/1qks_uXbVdNxOkX6JgCFMinat4QRqYcPyqZqEM2Ep-8M/edit?usp=sharing) for usage.

License:

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
