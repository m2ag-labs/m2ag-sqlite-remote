# TODO: check for required components
echo 'install pip'
sudo apt install python3-pip -y
echo 'upgrade setup tools'
sudo pip3 install --upgrade setuptools
echo 'install flask'
pip3 install Flask-HTTPAuth
pip3 install click
pip3 install Flask
pip3 install Flask-HTTPAuth
pip3 install Flask-SQLAlchemy
pip3 install itsdangerous
pip3 install Jinja2
pip3 install MarkupSafe
pip3 install passlib
pip3 install SQLAlchemy
pip3 install Werkzeug
# TODO: Install and enable service service
echo 'setup systemd'
sudo cp ./systemd/m2ag-api.service /lib/systemd/system/m2ag-sqlite-remote.service
sudo systemctl daemon-reload








