#!/usr/bin/env python3

import sys
import sqlite3
from flask import Flask, g, jsonify, request, send_from_directory
from urllib.request import pathname2url

if len(sys.argv) == 1:
    print('Please pass full path to the db file')
    exit(-1)

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

app = Flask(__name__)


def connect_db():
    """Connects to the specific database."""
    # rv = sqlite3.connect(os.path.join(app.root_path, db_name))
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


# The next three routes are for serving the app

@app.route('/')
def root():
    return app.send_static_file('index.html')


@app.route('/js/<path:path>')
def send_js(path):
    return send_from_directory('static/js', path)


@app.route('/css/<path:path>')
def send_css(path):
    return send_from_directory('static/css', path)


@app.route('/query', methods=['POST'])
def query():
    # TODO: add login
    # if not session.get('logged_in'):
    #    abort(401)
    sql = request.form['query']
    # does sql contain select?
    if sql.find('SELECT') & sql.find('select'):
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
    app.run(host='0.0.0.0', port='5000')
    # to enable ssl -- generate a cert.
    # app.run(host='0.0.0.0', port='5000', ssl_context=('local.crt', 'device.key'))
    # app.run(host='0.0.0.0', port='5000', debug='false')
