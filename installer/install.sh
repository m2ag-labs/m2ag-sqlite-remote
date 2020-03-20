# TODO: check for required components
echo 'install pip'
sudo apt install python3-pip -y
echo 'upgrade setup tools'
sudo pip3 install --upgrade setuptools
echo 'install flask'
pip3 install Flask
pip3 install Flask-HTTPAuth
pip3 install Werkzeug
# TODO: Install and enable service service
echo 'setup systemd'
sudo cp ./systemd/m2ag-sqlite-remote.service /lib/systemd/system/m2ag-sqlite-remote.service
sudo systemctl daemon-reload








