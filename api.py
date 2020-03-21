#!/usr/bin/env python3

import json
import sqlite3
import sys
from urllib.request import pathname2url

from flask import Flask, request, jsonify, g, send_from_directory, abort
from flask_httpauth import HTTPBasicAuth
from werkzeug.security import check_password_hash, generate_password_hash

# initialization
app = Flask(__name__)
auth = HTTPBasicAuth()


@auth.verify_password
def verify_password(username, password):
    if username != "":
        sql = "SELECT * FROM users WHERE name ='" + username + "'"
        ret = select(sql)
        if username in ret.json['data'][0]['name']:
            return check_password_hash(ret.json['data'][0]['password'], password)

    abort(401)
    return False


# the query is here
@app.route('/set_password', methods=['POST'])
@auth.login_required
def set_password():
    # TODO: wrap this with a try -- user name and password are plain text in json
    s = json.loads(request.data.decode("utf-8"))
    s = s['user']
    sql = "UPDATE users SET password = '" + generate_password_hash(s['password']) + "' WHERE name = '" + s[
        'username'] + "'"
    return query(sql)


# END AUTH and user stuff

def connect_db():
    """Connects to the specific database."""
    rv = sqlite3.connect(db_uri, uri=True)
    rv.row_factory = sqlite3.Row
    return rv


def get_db():
    """Opens a new database connection if there is none yet for the
    current application context.
    """
    if not hasattr(g, 'sqlite_db'):
        g.sqlite_db = connect_db()
    return g.sqlite_db


@app.teardown_appcontext
def close_db(error):
    """Closes the database again at the end of the request."""
    if hasattr(g, 'sqlite_db'):
        g.sqlite_db.close()


# The next two routes are for serving the app
@app.route('/')
def fwd_root():
    return root('index.html')


@app.route('/<path:path>')
def root(path):
    return send_from_directory('static', path)


# the query is here
@app.route('/query', methods=['POST'])
@auth.login_required
def query(sq=None):
    # TODO: wrap this with a try
    if not sq:
        s = json.loads(request.data.decode("utf-8"))
        sql = s['query']
    else:
        sql = sq
    # does sql contain select?
    if sql.upper().find('SELECT'):
        return not_select(sql)
    else:
        return select(sql)


def not_select(sql):
    ret = []
    try:
        db = get_db()
        db.execute(sql)
        db.commit()
        ret.append(dict(status="ok"))
    except sqlite3.Error as e:
        print("Database error: %s" % e)
        ret.append(dict(error=str(e)))
    except Exception as e:
        print("Exception in _query: %s" % e)
        ret.append(dict(error=str(e)))
    finally:
        return jsonify({'data': ret})


def select(sql):
    ret = []
    try:
        db = get_db()
        curr = db.execute(sql)
        data = curr.fetchall()
        for entry in data:
            cols = {}
            keys = entry.keys()
            for key in keys:
                cols[key] = entry[keys.index(key)]

            ret.append(cols)

    except sqlite3.Error as e:
        print("Database error: %s" % e)
        ret.append(dict(error=str(e)))
    except Exception as e:
        print("Exception in _query: %s" % e)
        ret.append(dict(error=str(e)))
    finally:
        return jsonify({'data': ret})


if __name__ == '__main__':
    db_name = sys.argv[1]
    db_uri = 'file:{}?mode=rw'.format(pathname2url(db_name))
    # check to see if this file exists
    try:
        conn = sqlite3.connect(db_uri, uri=True)
        conn.close()
    except sqlite3.OperationalError:
        print(db_name + ' does not exist')
        exit(-1)
        # handle missing database case

    # app.run(host='0.0.0.0', port='5000')
    # to enable ssl -- generate a cert.
    app.run(host='0.0.0.0', port='5001', ssl_context=('/home/pi/.certs/server.crt', '/home/pi/.certs/server.key'))
