Systemd files to start the services:

Commands: 
sudo systemctl status <service name>
sudo systemctl start <service name>
sudo systemctl enable <sercie name>
sudo systemctl daemon-reload

Place in /etc/systemd/system

API: 

Service name: m2ag-sqlite-remote

Filename: m2ag-api.service

Contents: 

[Unit]

Description=m2ag.labs device api
After=network.target

[Service]

User=pi
WorkingDirectory=/home/pi/m2ag-sqlite-remote
ExecStart=python3 api.py
Restart=always

[Install]
WantedBy=multi-user.target

reference:
https://blog.miguelgrinberg.com/post/running-a-flask-application-as-a-service-with-systemd
