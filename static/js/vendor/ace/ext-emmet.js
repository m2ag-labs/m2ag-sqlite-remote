ace.define("ace/snippets", ["require", "exports", "module", "ace/lib/oop", "ace/lib/event_emitter", "ace/lib/lang", "ace/range", "ace/range_list", "ace/keyboard/hash_handler", "ace/tokenizer", "ace/clipboard", "ace/lib/dom", "ace/editor"], function (require, exports, module) {
    "use strict";
    var oop = require("./lib/oop");
    var EventEmitter = require("./lib/event_emitter").EventEmitter;
    var lang = require("./lib/lang");
    var Range = require("./range").Range;
    var RangeList = require("./range_list").RangeList;
    var HashHandler = require("./keyboard/hash_handler").HashHandler;
    var Tokenizer = require("./tokenizer").Tokenizer;
    var clipboard = require("./clipboard");

    var VARIABLES = {
        CURRENT_WORD: function (editor) {
            return editor.session.getTextRange(editor.session.getWordRange());
        },
        SELECTION: function (editor, name, indentation) {
            var text = editor.session.getTextRange();
            if (indentation)
                return text.replace(/\n\r?([ \t]*\S)/g, "\n" + indentation + "$1");
            return text;
        },
        CURRENT_LINE: function (editor) {
            return editor.session.getLine(editor.getCursorPosition().row);
        },
        PREV_LINE: function (editor) {
            return editor.session.getLine(editor.getCursorPosition().row - 1);
        },
        LINE_INDEX: function (editor) {
            return editor.getCursorPosition().row;
        },
        LINE_NUMBER: function (editor) {
            return editor.getCursorPosition().row + 1;
        },
        SOFT_TABS: function (editor) {
            return editor.session.getUseSoftTabs() ? "YES" : "NO";
        },
        TAB_SIZE: function (editor) {
            return editor.session.getTabSize();
        },
        CLIPBOARD: function (editor) {
            return clipboard.getText && clipboard.getText();
        },
        FILENAME: function (editor) {
            return /[^/\\]*$/.exec(this.FILEPATH(editor))[0];
        },
        FILENAME_BASE: function (editor) {
            return /[^/\\]*$/.exec(this.FILEPATH(editor))[0].replace(/\.[^.]*$/, "");
        },
        DIRECTORY: function (editor) {
            return this.FILEPATH(editor).replace(/[^/\\]*$/, "");
        },
        FILEPATH: function (editor) {
            return "/not implemented.txt";
        },
        WORKSPACE_NAME: function () {
            return "Unknown";
        },
        FULLNAME: function () {
            return "Unknown";
        },
        BLOCK_COMMENT_START: function (editor) {
            var mode = editor.session.$mode || {};
            return mode.blockComment && mode.blockComment.start || "";
        },
        BLOCK_COMMENT_END: function (editor) {
            var mode = editor.session.$mode || {};
            return mode.blockComment && mode.blockComment.end || "";
        },
        LINE_COMMENT: function (editor) {
            var mode = editor.session.$mode || {};
            return mode.lineCommentStart || "";
        },
        CURRENT_YEAR: date.bind(null, {year: "numeric"}),
        CURRENT_YEAR_SHORT: date.bind(null, {year: "2-digit"}),
        CURRENT_MONTH: date.bind(null, {month: "numeric"}),
        CURRENT_MONTH_NAME: date.bind(null, {month: "long"}),
        CURRENT_MONTH_NAME_SHORT: date.bind(null, {month: "short"}),
        CURRENT_DATE: date.bind(null, {day: "2-digit"}),
        CURRENT_DAY_NAME: date.bind(null, {weekday: "long"}),
        CURRENT_DAY_NAME_SHORT: date.bind(null, {weekday: "short"}),
        CURRENT_HOUR: date.bind(null, {hour: "2-digit", hour12: false}),
        CURRENT_MINUTE: date.bind(null, {minute: "2-digit"}),
        CURRENT_SECOND: date.bind(null, {second: "2-digit"})
    };

    VARIABLES.SELECTED_TEXT = VARIABLES.SELECTION;

    function date(dateFormat) {
        var str = new Date().toLocaleString("en-us", dateFormat);
        return str.length == 1 ? "0" + str : str;
    }

    var SnippetManager = function () {
        this.snippetMap = {};
        this.snippetNameMap = {};
    };

    (function () {
        oop.implement(this, EventEmitter);

        this.getTokenizer = function () {
            return SnippetManager.$tokenizer || this.createTokenizer();
        };

        this.createTokenizer = function () {
            function TabstopToken(str) {
                str = str.substr(1);
                if (/^\d+$/.test(str))
                    return [{tabstopId: parseInt(str, 10)}];
                return [{text: str}];
            }

            function escape(ch) {
                return "(?:[^\\\\" + ch + "]|\\\\.)";
            }

            var formatMatcher = {
                regex: "/(" + escape("/") + "+)/",
                onMatch: function (val, state, stack) {
                    var ts = stack[0];
                    ts.fmtString = true;
                    ts.guard = val.slice(1, -1);
                    ts.flag = "";
                    return "";
                },
                next: "formatString"
            };

            SnippetManager.$tokenizer = new Tokenizer({
                start: [
                    {
                        regex: /\\./, onMatch: function (val, state, stack) {
                            var ch = val[1];
                            if (ch == "}" && stack.length) {
                                val = ch;
                            } else if ("`$\\".indexOf(ch) != -1) {
                                val = ch;
                            }
                            return [val];
                        }
                    },
                    {
                        regex: /}/, onMatch: function (val, state, stack) {
                            return [stack.length ? stack.shift() : val];
                        }
                    },
                    {regex: /\$(?:\d+|\w+)/, onMatch: TabstopToken},
                    {
                        regex: /\$\{[\dA-Z_a-z]+/, onMatch: function (str, state, stack) {
                            var t = TabstopToken(str.substr(1));
                            stack.unshift(t[0]);
                            return t;
                        }, next: "snippetVar"
                    },
                    {regex: /\n/, token: "newline", merge: false}
                ],
                snippetVar: [
                    {
                        regex: "\\|" + escape("\\|") + "*\\|", onMatch: function (val, state, stack) {
                            var choices = val.slice(1, -1).replace(/\\[,|\\]|,/g, function (operator) {
                                return operator.length == 2 ? operator[1] : "\x00";
                            }).split("\x00");
                            stack[0].choices = choices;
                            return [choices[0]];
                        }, next: "start"
                    },
                    formatMatcher,
                    {regex: "([^:}\\\\]|\\\\.)*:?", token: "", next: "start"}
                ],
                formatString: [
                    {
                        regex: /:/, onMatch: function (val, state, stack) {
                            if (stack.length && stack[0].expectElse) {
                                stack[0].expectElse = false;
                                stack[0].ifEnd = {elseEnd: stack[0]};
                                return [stack[0].ifEnd];
                            }
                            return ":";
                        }
                    },
                    {
                        regex: /\\./, onMatch: function (val, state, stack) {
                            var ch = val[1];
                            if (ch == "}" && stack.length)
                                val = ch;
                            else if ("`$\\".indexOf(ch) != -1)
                                val = ch;
                            else if (ch == "n")
                                val = "\n";
                            else if (ch == "t")
                                val = "\t";
                            else if ("ulULE".indexOf(ch) != -1)
                                val = {changeCase: ch, local: ch > "a"};
                            return [val];
                        }
                    },
                    {
                        regex: "/\\w*}", onMatch: function (val, state, stack) {
                            var next = stack.shift();
                            if (next)
                                next.flag = val.slice(1, -1);
                            this.next = next && next.tabstopId ? "start" : "";
                            return [next || val];
                        }, next: "start"
                    },
                    {
                        regex: /\$(?:\d+|\w+)/, onMatch: function (val, state, stack) {
                            return [{text: val.slice(1)}];
                        }
                    },
                    {
                        regex: /\${\w+/, onMatch: function (val, state, stack) {
                            var token = {text: val.slice(2)};
                            stack.unshift(token);
                            return [token];
                        }, next: "formatStringVar"
                    },
                    {regex: /\n/, token: "newline", merge: false},
                    {
                        regex: /}/, onMatch: function (val, state, stack) {
                            var next = stack.shift();
                            this.next = next && next.tabstopId ? "start" : "";
                            return [next || val];
                        }, next: "start"
                    }
                ],
                formatStringVar: [
                    {
                        regex: /:\/\w+}/, onMatch: function (val, state, stack) {
                            var ts = stack[0];
                            ts.formatFunction = val.slice(2, -1);
                            return [stack.shift()];
                        }, next: "formatString"
                    },
                    formatMatcher,
                    {
                        regex: /:[\?\-+]?/, onMatch: function (val, state, stack) {
                            if (val[1] == "+")
                                stack[0].ifEnd = stack[0];
                            if (val[1] == "?")
                                stack[0].expectElse = true;
                        }, next: "formatString"
                    },
                    {regex: "([^:}\\\\]|\\\\.)*:?", token: "", next: "formatString"}
                ]
            });
            return SnippetManager.$tokenizer;
        };

        this.tokenizeTmSnippet = function (str, startState) {
            return this.getTokenizer().getLineTokens(str, startState).tokens.map(function (x) {
                return x.value || x;
            });
        };

        this.getVariableValue = function (editor, name, indentation) {
            if (/^\d+$/.test(name))
                return (this.variables.__ || {})[name] || "";
            if (/^[A-Z]\d+$/.test(name))
                return (this.variables[name[0] + "__"] || {})[name.substr(1)] || "";

            name = name.replace(/^TM_/, "");
            if (!this.variables.hasOwnProperty(name))
                return "";
            var value = this.variables[name];
            if (typeof value == "function")
                value = this.variables[name](editor, name, indentation);
            return value == null ? "" : value;
        };

        this.variables = VARIABLES;
        this.tmStrFormat = function (str, ch, editor) {
            if (!ch.fmt) return str;
            var flag = ch.flag || "";
            var re = ch.guard;
            re = new RegExp(re, flag.replace(/[^gim]/g, ""));
            var fmtTokens = typeof ch.fmt == "string" ? this.tokenizeTmSnippet(ch.fmt, "formatString") : ch.fmt;
            var _self = this;
            var formatted = str.replace(re, function () {
                var oldArgs = _self.variables.__;
                _self.variables.__ = [].slice.call(arguments);
                var fmtParts = _self.resolveVariables(fmtTokens, editor);
                var gChangeCase = "E";
                for (var i = 0; i < fmtParts.length; i++) {
                    var ch = fmtParts[i];
                    if (typeof ch == "object") {
                        fmtParts[i] = "";
                        if (ch.changeCase && ch.local) {
                            var next = fmtParts[i + 1];
                            if (next && typeof next == "string") {
                                if (ch.changeCase == "u")
                                    fmtParts[i] = next[0].toUpperCase();
                                else
                                    fmtParts[i] = next[0].toLowerCase();
                                fmtParts[i + 1] = next.substr(1);
                            }
                        } else if (ch.changeCase) {
                            gChangeCase = ch.changeCase;
                        }
                    } else if (gChangeCase == "U") {
                        fmtParts[i] = ch.toUpperCase();
                    } else if (gChangeCase == "L") {
                        fmtParts[i] = ch.toLowerCase();
                    }
                }
                _self.variables.__ = oldArgs;
                return fmtParts.join("");
            });
            return formatted;
        };

        this.tmFormatFunction = function (str, ch, editor) {
            if (ch.formatFunction == "upcase")
                return str.toUpperCase();
            if (ch.formatFunction == "downcase")
                return str.toLowerCase();
            return str;
        };

        this.resolveVariables = function (snippet, editor) {
            var result = [];
            var indentation = "";
            var afterNewLine = true;
            for (var i = 0; i < snippet.length; i++) {
                var ch = snippet[i];
                if (typeof ch == "string") {
                    result.push(ch);
                    if (ch == "\n") {
                        afterNewLine = true;
                        indentation = "";
                    } else if (afterNewLine) {
                        indentation = /^\t*/.exec(ch)[0];
                        afterNewLine = /\S/.test(ch);
                    }
                    continue;
                }
                if (!ch) continue;
                afterNewLine = false;

                if (ch.fmtString) {
                    var j = snippet.indexOf(ch, i + 1);
                    if (j == -1) j = snippet.length;
                    ch.fmt = snippet.slice(i + 1, j);
                    i = j;
                }

                if (ch.text) {
                    var value = this.getVariableValue(editor, ch.text, indentation) + "";
                    if (ch.fmtString)
                        value = this.tmStrFormat(value, ch, editor);
                    if (ch.formatFunction)
                        value = this.tmFormatFunction(value, ch, editor);

                    if (value && !ch.ifEnd) {
                        result.push(value);
                        gotoNext(ch);
                    } else if (!value && ch.ifEnd) {
                        gotoNext(ch.ifEnd);
                    }
                } else if (ch.elseEnd) {
                    gotoNext(ch.elseEnd);
                } else if (ch.tabstopId != null) {
                    result.push(ch);
                } else if (ch.changeCase != null) {
                    result.push(ch);
                }
            }

            function gotoNext(ch) {
                var i1 = snippet.indexOf(ch, i + 1);
                if (i1 != -1)
                    i = i1;
            }

            return result;
        };

        this.insertSnippetForSelection = function (editor, snippetText) {
            var cursor = editor.getCursorPosition();
            var line = editor.session.getLine(cursor.row);
            var tabString = editor.session.getTabString();
            var indentString = line.match(/^\s*/)[0];

            if (cursor.column < indentString.length)
                indentString = indentString.slice(0, cursor.column);

            snippetText = snippetText.replace(/\r/g, "");
            var tokens = this.tokenizeTmSnippet(snippetText);
            tokens = this.resolveVariables(tokens, editor);
            tokens = tokens.map(function (x) {
                if (x == "\n")
                    return x + indentString;
                if (typeof x == "string")
                    return x.replace(/\t/g, tabString);
                return x;
            });
            var tabstops = [];
            tokens.forEach(function (p, i) {
                if (typeof p != "object")
                    return;
                var id = p.tabstopId;
                var ts = tabstops[id];
                if (!ts) {
                    ts = tabstops[id] = [];
                    ts.index = id;
                    ts.value = "";
                    ts.parents = {};
                }
                if (ts.indexOf(p) !== -1)
                    return;
                if (p.choices && !ts.choices)
                    ts.choices = p.choices;
                ts.push(p);
                var i1 = tokens.indexOf(p, i + 1);
                if (i1 === -1)
                    return;

                var value = tokens.slice(i + 1, i1);
                var isNested = value.some(function (t) {
                    return typeof t === "object";
                });
                if (isNested && !ts.value) {
                    ts.value = value;
                } else if (value.length && (!ts.value || typeof ts.value !== "string")) {
                    ts.value = value.join("");
                }
            });
            tabstops.forEach(function (ts) {
                ts.length = 0;
            });
            var expanding = {};

            function copyValue(val) {
                var copy = [];
                for (var i = 0; i < val.length; i++) {
                    var p = val[i];
                    if (typeof p == "object") {
                        if (expanding[p.tabstopId])
                            continue;
                        var j = val.lastIndexOf(p, i - 1);
                        p = copy[j] || {tabstopId: p.tabstopId};
                    }
                    copy[i] = p;
                }
                return copy;
            }

            for (var i = 0; i < tokens.length; i++) {
                var p = tokens[i];
                if (typeof p != "object")
                    continue;
                var id = p.tabstopId;
                var ts = tabstops[id];
                var i1 = tokens.indexOf(p, i + 1);
                if (expanding[id]) {
                    if (expanding[id] === p) {
                        delete expanding[id];
                        Object.keys(expanding).forEach(function (parentId) {
                            ts.parents[parentId] = true;
                        });
                    }
                    continue;
                }
                expanding[id] = p;
                var value = ts.value;
                if (typeof value !== "string")
                    value = copyValue(value);
                else if (p.fmt)
                    value = this.tmStrFormat(value, p, editor);
                tokens.splice.apply(tokens, [i + 1, Math.max(0, i1 - i)].concat(value, p));

                if (ts.indexOf(p) === -1)
                    ts.push(p);
            }
            var row = 0, column = 0;
            var text = "";
            tokens.forEach(function (t) {
                if (typeof t === "string") {
                    var lines = t.split("\n");
                    if (lines.length > 1) {
                        column = lines[lines.length - 1].length;
                        row += lines.length - 1;
                    } else
                        column += t.length;
                    text += t;
                } else if (t) {
                    if (!t.start)
                        t.start = {row: row, column: column};
                    else
                        t.end = {row: row, column: column};
                }
            });
            var range = editor.getSelectionRange();
            var end = editor.session.replace(range, text);

            var tabstopManager = new TabstopManager(editor);
            var selectionId = editor.inVirtualSelectionMode && editor.selection.index;
            tabstopManager.addTabstops(tabstops, range.start, end, selectionId);
        };

        this.insertSnippet = function (editor, snippetText) {
            var self = this;
            if (editor.inVirtualSelectionMode)
                return self.insertSnippetForSelection(editor, snippetText);

            editor.forEachSelection(function () {
                self.insertSnippetForSelection(editor, snippetText);
            }, null, {keepOrder: true});

            if (editor.tabstopManager)
                editor.tabstopManager.tabNext();
        };

        this.$getScope = function (editor) {
            var scope = editor.session.$mode.$id || "";
            scope = scope.split("/").pop();
            if (scope === "html" || scope === "php") {
                if (scope === "php" && !editor.session.$mode.inlinePhp)
                    scope = "html";
                var c = editor.getCursorPosition();
                var state = editor.session.getState(c.row);
                if (typeof state === "object") {
                    state = state[0];
                }
                if (state.substring) {
                    if (state.substring(0, 3) == "js-")
                        scope = "javascript";
                    else if (state.substring(0, 4) == "css-")
                        scope = "css";
                    else if (state.substring(0, 4) == "php-")
                        scope = "php";
                }
            }

            return scope;
        };

        this.getActiveScopes = function (editor) {
            var scope = this.$getScope(editor);
            var scopes = [scope];
            var snippetMap = this.snippetMap;
            if (snippetMap[scope] && snippetMap[scope].includeScopes) {
                scopes.push.apply(scopes, snippetMap[scope].includeScopes);
            }
            scopes.push("_");
            return scopes;
        };

        this.expandWithTab = function (editor, options) {
            var self = this;
            var result = editor.forEachSelection(function () {
                return self.expandSnippetForSelection(editor, options);
            }, null, {keepOrder: true});
            if (result && editor.tabstopManager)
                editor.tabstopManager.tabNext();
            return result;
        };

        this.expandSnippetForSelection = function (editor, options) {
            var cursor = editor.getCursorPosition();
            var line = editor.session.getLine(cursor.row);
            var before = line.substring(0, cursor.column);
            var after = line.substr(cursor.column);

            var snippetMap = this.snippetMap;
            var snippet;
            this.getActiveScopes(editor).some(function (scope) {
                var snippets = snippetMap[scope];
                if (snippets)
                    snippet = this.findMatchingSnippet(snippets, before, after);
                return !!snippet;
            }, this);
            if (!snippet)
                return false;
            if (options && options.dryRun)
                return true;
            editor.session.doc.removeInLine(cursor.row,
                cursor.column - snippet.replaceBefore.length,
                cursor.column + snippet.replaceAfter.length
            );

            this.variables.M__ = snippet.matchBefore;
            this.variables.T__ = snippet.matchAfter;
            this.insertSnippetForSelection(editor, snippet.content);

            this.variables.M__ = this.variables.T__ = null;
            return true;
        };

        this.findMatchingSnippet = function (snippetList, before, after) {
            for (var i = snippetList.length; i--;) {
                var s = snippetList[i];
                if (s.startRe && !s.startRe.test(before))
                    continue;
                if (s.endRe && !s.endRe.test(after))
                    continue;
                if (!s.startRe && !s.endRe)
                    continue;

                s.matchBefore = s.startRe ? s.startRe.exec(before) : [""];
                s.matchAfter = s.endRe ? s.endRe.exec(after) : [""];
                s.replaceBefore = s.triggerRe ? s.triggerRe.exec(before)[0] : "";
                s.replaceAfter = s.endTriggerRe ? s.endTriggerRe.exec(after)[0] : "";
                return s;
            }
        };

        this.snippetMap = {};
        this.snippetNameMap = {};
        this.register = function (snippets, scope) {
            var snippetMap = this.snippetMap;
            var snippetNameMap = this.snippetNameMap;
            var self = this;

            if (!snippets)
                snippets = [];

            function wrapRegexp(src) {
                if (src && !/^\^?\(.*\)\$?$|^\\b$/.test(src))
                    src = "(?:" + src + ")";

                return src || "";
            }

            function guardedRegexp(re, guard, opening) {
                re = wrapRegexp(re);
                guard = wrapRegexp(guard);
                if (opening) {
                    re = guard + re;
                    if (re && re[re.length - 1] != "$")
                        re = re + "$";
                } else {
                    re = re + guard;
                    if (re && re[0] != "^")
                        re = "^" + re;
                }
                return new RegExp(re);
            }

            function addSnippet(s) {
                if (!s.scope)
                    s.scope = scope || "_";
                scope = s.scope;
                if (!snippetMap[scope]) {
                    snippetMap[scope] = [];
                    snippetNameMap[scope] = {};
                }

                var map = snippetNameMap[scope];
                if (s.name) {
                    var old = map[s.name];
                    if (old)
                        self.unregister(old);
                    map[s.name] = s;
                }
                snippetMap[scope].push(s);

                if (s.tabTrigger && !s.trigger) {
                    if (!s.guard && /^\w/.test(s.tabTrigger))
                        s.guard = "\\b";
                    s.trigger = lang.escapeRegExp(s.tabTrigger);
                }

                if (!s.trigger && !s.guard && !s.endTrigger && !s.endGuard)
                    return;

                s.startRe = guardedRegexp(s.trigger, s.guard, true);
                s.triggerRe = new RegExp(s.trigger);

                s.endRe = guardedRegexp(s.endTrigger, s.endGuard, true);
                s.endTriggerRe = new RegExp(s.endTrigger);
            }

            if (snippets && snippets.content)
                addSnippet(snippets);
            else if (Array.isArray(snippets))
                snippets.forEach(addSnippet);

            this._signal("registerSnippets", {scope: scope});
        };
        this.unregister = function (snippets, scope) {
            var snippetMap = this.snippetMap;
            var snippetNameMap = this.snippetNameMap;

            function removeSnippet(s) {
                var nameMap = snippetNameMap[s.scope || scope];
                if (nameMap && nameMap[s.name]) {
                    delete nameMap[s.name];
                    var map = snippetMap[s.scope || scope];
                    var i = map && map.indexOf(s);
                    if (i >= 0)
                        map.splice(i, 1);
                }
            }

            if (snippets.content)
                removeSnippet(snippets);
            else if (Array.isArray(snippets))
                snippets.forEach(removeSnippet);
        };
        this.parseSnippetFile = function (str) {
            str = str.replace(/\r/g, "");
            var list = [], snippet = {};
            var re = /^#.*|^({[\s\S]*})\s*$|^(\S+) (.*)$|^((?:\n*\t.*)+)/gm;
            var m;
            while (m = re.exec(str)) {
                if (m[1]) {
                    try {
                        snippet = JSON.parse(m[1]);
                        list.push(snippet);
                    } catch (e) {
                    }
                }
                if (m[4]) {
                    snippet.content = m[4].replace(/^\t/gm, "");
                    list.push(snippet);
                    snippet = {};
                } else {
                    var key = m[2], val = m[3];
                    if (key == "regex") {
                        var guardRe = /\/((?:[^\/\\]|\\.)*)|$/g;
                        snippet.guard = guardRe.exec(val)[1];
                        snippet.trigger = guardRe.exec(val)[1];
                        snippet.endTrigger = guardRe.exec(val)[1];
                        snippet.endGuard = guardRe.exec(val)[1];
                    } else if (key == "snippet") {
                        snippet.tabTrigger = val.match(/^\S*/)[0];
                        if (!snippet.name)
                            snippet.name = val;
                    } else {
                        snippet[key] = val;
                    }
                }
            }
            return list;
        };
        this.getSnippetByName = function (name, editor) {
            var snippetMap = this.snippetNameMap;
            var snippet;
            this.getActiveScopes(editor).some(function (scope) {
                var snippets = snippetMap[scope];
                if (snippets)
                    snippet = snippets[name];
                return !!snippet;
            }, this);
            return snippet;
        };

    }).call(SnippetManager.prototype);


    var TabstopManager = function (editor) {
        if (editor.tabstopManager)
            return editor.tabstopManager;
        editor.tabstopManager = this;
        this.$onChange = this.onChange.bind(this);
        this.$onChangeSelection = lang.delayedCall(this.onChangeSelection.bind(this)).schedule;
        this.$onChangeSession = this.onChangeSession.bind(this);
        this.$onAfterExec = this.onAfterExec.bind(this);
        this.attach(editor);
    };
    (function () {
        this.attach = function (editor) {
            this.index = 0;
            this.ranges = [];
            this.tabstops = [];
            this.$openTabstops = null;
            this.selectedTabstop = null;

            this.editor = editor;
            this.editor.on("change", this.$onChange);
            this.editor.on("changeSelection", this.$onChangeSelection);
            this.editor.on("changeSession", this.$onChangeSession);
            this.editor.commands.on("afterExec", this.$onAfterExec);
            this.editor.keyBinding.addKeyboardHandler(this.keyboardHandler);
        };
        this.detach = function () {
            this.tabstops.forEach(this.removeTabstopMarkers, this);
            this.ranges = null;
            this.tabstops = null;
            this.selectedTabstop = null;
            this.editor.removeListener("change", this.$onChange);
            this.editor.removeListener("changeSelection", this.$onChangeSelection);
            this.editor.removeListener("changeSession", this.$onChangeSession);
            this.editor.commands.removeListener("afterExec", this.$onAfterExec);
            this.editor.keyBinding.removeKeyboardHandler(this.keyboardHandler);
            this.editor.tabstopManager = null;
            this.editor = null;
        };

        this.onChange = function (delta) {
            var isRemove = delta.action[0] == "r";
            var parents = this.selectedTabstop && this.selectedTabstop.parents || {};
            var tabstops = (this.tabstops || []).slice();
            for (var i = 0; i < tabstops.length; i++) {
                var ts = tabstops[i];
                var active = ts == this.selectedTabstop || parents[ts.index];
                ts.rangeList.$bias = active ? 0 : 1;

                if (delta.action == "remove" && ts !== this.selectedTabstop) {
                    var parentActive = ts.parents && ts.parents[this.selectedTabstop.index];
                    var startIndex = ts.rangeList.pointIndex(delta.start, parentActive);
                    startIndex = startIndex < 0 ? -startIndex - 1 : startIndex + 1;
                    var endIndex = ts.rangeList.pointIndex(delta.end, parentActive);
                    endIndex = endIndex < 0 ? -endIndex - 1 : endIndex - 1;
                    var toRemove = ts.rangeList.ranges.slice(startIndex, endIndex);
                    for (var j = 0; j < toRemove.length; j++)
                        this.removeRange(toRemove[j]);
                }
                ts.rangeList.$onChange(delta);
            }
            var session = this.editor.session;
            if (!this.$inChange && isRemove && session.getLength() == 1 && !session.getValue())
                this.detach();
        };
        this.updateLinkedFields = function () {
            var ts = this.selectedTabstop;
            if (!ts || !ts.hasLinkedRanges || !ts.firstNonLinked)
                return;
            this.$inChange = true;
            var session = this.editor.session;
            var text = session.getTextRange(ts.firstNonLinked);
            for (var i = 0; i < ts.length; i++) {
                var range = ts[i];
                if (!range.linked)
                    continue;
                var original = range.original;
                var fmt = exports.snippetManager.tmStrFormat(text, original, this.editor);
                session.replace(range, fmt);
            }
            this.$inChange = false;
        };
        this.onAfterExec = function (e) {
            if (e.command && !e.command.readOnly)
                this.updateLinkedFields();
        };
        this.onChangeSelection = function () {
            if (!this.editor)
                return;
            var lead = this.editor.selection.lead;
            var anchor = this.editor.selection.anchor;
            var isEmpty = this.editor.selection.isEmpty();
            for (var i = 0; i < this.ranges.length; i++) {
                if (this.ranges[i].linked)
                    continue;
                var containsLead = this.ranges[i].contains(lead.row, lead.column);
                var containsAnchor = isEmpty || this.ranges[i].contains(anchor.row, anchor.column);
                if (containsLead && containsAnchor)
                    return;
            }
            this.detach();
        };
        this.onChangeSession = function () {
            this.detach();
        };
        this.tabNext = function (dir) {
            var max = this.tabstops.length;
            var index = this.index + (dir || 1);
            index = Math.min(Math.max(index, 1), max);
            if (index == max)
                index = 0;
            this.selectTabstop(index);
            if (index === 0)
                this.detach();
        };
        this.selectTabstop = function (index) {
            this.$openTabstops = null;
            var ts = this.tabstops[this.index];
            if (ts)
                this.addTabstopMarkers(ts);
            this.index = index;
            ts = this.tabstops[this.index];
            if (!ts || !ts.length)
                return;

            this.selectedTabstop = ts;
            var range = ts.firstNonLinked || ts;
            if (!this.editor.inVirtualSelectionMode) {
                var sel = this.editor.multiSelect;
                sel.toSingleRange(range.clone());
                for (var i = 0; i < ts.length; i++) {
                    if (ts.hasLinkedRanges && ts[i].linked)
                        continue;
                    sel.addRange(ts[i].clone(), true);
                }
                if (sel.ranges[0])
                    sel.addRange(sel.ranges[0].clone());
            } else {
                this.editor.selection.setRange(range);
            }

            this.editor.keyBinding.addKeyboardHandler(this.keyboardHandler);
            if (this.selectedTabstop && this.selectedTabstop.choices)
                this.editor.execCommand("startAutocomplete", {matches: this.selectedTabstop.choices});
        };
        this.addTabstops = function (tabstops, start, end) {
            var useLink = this.useLink || !this.editor.getOption("enableMultiselect");

            if (!this.$openTabstops)
                this.$openTabstops = [];
            if (!tabstops[0]) {
                var p = Range.fromPoints(end, end);
                moveRelative(p.start, start);
                moveRelative(p.end, start);
                tabstops[0] = [p];
                tabstops[0].index = 0;
            }

            var i = this.index;
            var arg = [i + 1, 0];
            var ranges = this.ranges;
            tabstops.forEach(function (ts, index) {
                var dest = this.$openTabstops[index] || ts;
                ts.rangeList = new RangeList();
                ts.rangeList.$bias = 0;

                for (var i = 0; i < ts.length; i++) {
                    var p = ts[i];
                    var range = Range.fromPoints(p.start, p.end || p.start);
                    movePoint(range.start, start);
                    movePoint(range.end, start);
                    range.original = p;
                    range.tabstop = dest;
                    ranges.push(range);
                    ts.rangeList.ranges.push(range);
                    if (dest != ts)
                        dest.unshift(range);
                    else
                        dest[i] = range;
                    if (p.fmtString || (dest.firstNonLinked && useLink)) {
                        range.linked = true;
                        dest.hasLinkedRanges = true;
                    } else if (!dest.firstNonLinked)
                        dest.firstNonLinked = range;
                }
                if (!dest.firstNonLinked)
                    dest.hasLinkedRanges = false;
                if (dest === ts) {
                    arg.push(dest);
                    this.$openTabstops[index] = dest;
                }
                this.addTabstopMarkers(dest);
            }, this);

            if (arg.length > 2) {
                if (this.tabstops.length)
                    arg.push(arg.splice(2, 1)[0]);
                this.tabstops.splice.apply(this.tabstops, arg);
            }
        };

        this.addTabstopMarkers = function (ts) {
            var session = this.editor.session;
            ts.forEach(function (range) {
                if (!range.markerId)
                    range.markerId = session.addMarker(range, "ace_snippet-marker", "text");
            });
        };
        this.removeTabstopMarkers = function (ts) {
            var session = this.editor.session;
            ts.forEach(function (range) {
                session.removeMarker(range.markerId);
                range.markerId = null;
            });
        };
        this.removeRange = function (range) {
            var i = range.tabstop.indexOf(range);
            if (i != -1) range.tabstop.splice(i, 1);
            i = this.ranges.indexOf(range);
            if (i != -1) this.ranges.splice(i, 1);
            i = range.tabstop.rangeList.ranges.indexOf(range);
            if (i != -1) range.tabstop.splice(i, 1);
            this.editor.session.removeMarker(range.markerId);
            if (!range.tabstop.length) {
                i = this.tabstops.indexOf(range.tabstop);
                if (i != -1)
                    this.tabstops.splice(i, 1);
                if (!this.tabstops.length)
                    this.detach();
            }
        };

        this.keyboardHandler = new HashHandler();
        this.keyboardHandler.bindKeys({
            "Tab": function (ed) {
                if (exports.snippetManager && exports.snippetManager.expandWithTab(ed)) {
                    return;
                }

                ed.tabstopManager.tabNext(1);
            },
            "Shift-Tab": function (ed) {
                ed.tabstopManager.tabNext(-1);
            },
            "Esc": function (ed) {
                ed.tabstopManager.detach();
            },
            "Return": function (ed) {
                return false;
            }
        });
    }).call(TabstopManager.prototype);


    var movePoint = function (point, diff) {
        if (point.row == 0)
            point.column += diff.column;
        point.row += diff.row;
    };

    var moveRelative = function (point, start) {
        if (point.row == start.row)
            point.column -= start.column;
        point.row -= start.row;
    };


    require("./lib/dom").importCssString("\
.ace_snippet-marker {\
    -moz-box-sizing: border-box;\
    box-sizing: border-box;\
    background: rgba(194, 193, 208, 0.09);\
    border: 1px dotted rgba(211, 208, 235, 0.62);\
    position: absolute;\
}");

    exports.snippetManager = new SnippetManager();


    var Editor = require("./editor").Editor;
    (function () {
        this.insertSnippet = function (content, options) {
            return exports.snippetManager.insertSnippet(this, content, options);
        };
        this.expandSnippet = function (options) {
            return exports.snippetManager.expandWithTab(this, options);
        };
    }).call(Editor.prototype);

});

ace.define("ace/ext/emmet", ["require", "exports", "module", "ace/keyboard/hash_handler", "ace/editor", "ace/snippets", "ace/range", "ace/config", "resources", "resources", "tabStops", "resources", "utils", "actions"], function (require, exports, module) {
    "use strict";
    var HashHandler = require("../keyboard/hash_handler").HashHandler;
    var Editor = require("../editor").Editor;
    var snippetManager = require("../snippets").snippetManager;
    var Range = require("../range").Range;
    var config = require("../config");
    var emmet, emmetPath;

    function AceEmmetEditor() {
    }

    AceEmmetEditor.prototype = {
        setupContext: function (editor) {
            this.ace = editor;
            this.indentation = editor.session.getTabString();
            if (!emmet)
                emmet = window.emmet;
            var resources = emmet.resources || emmet.require("resources");
            resources.setVariable("indentation", this.indentation);
            this.$syntax = null;
            this.$syntax = this.getSyntax();
        },
        getSelectionRange: function () {
            var range = this.ace.getSelectionRange();
            var doc = this.ace.session.doc;
            return {
                start: doc.positionToIndex(range.start),
                end: doc.positionToIndex(range.end)
            };
        },
        createSelection: function (start, end) {
            var doc = this.ace.session.doc;
            this.ace.selection.setRange({
                start: doc.indexToPosition(start),
                end: doc.indexToPosition(end)
            });
        },
        getCurrentLineRange: function () {
            var ace = this.ace;
            var row = ace.getCursorPosition().row;
            var lineLength = ace.session.getLine(row).length;
            var index = ace.session.doc.positionToIndex({row: row, column: 0});
            return {
                start: index,
                end: index + lineLength
            };
        },
        getCaretPos: function () {
            var pos = this.ace.getCursorPosition();
            return this.ace.session.doc.positionToIndex(pos);
        },
        setCaretPos: function (index) {
            var pos = this.ace.session.doc.indexToPosition(index);
            this.ace.selection.moveToPosition(pos);
        },
        getCurrentLine: function () {
            var row = this.ace.getCursorPosition().row;
            return this.ace.session.getLine(row);
        },
        replaceContent: function (value, start, end, noIndent) {
            if (end == null)
                end = start == null ? this.getContent().length : start;
            if (start == null)
                start = 0;

            var editor = this.ace;
            var doc = editor.session.doc;
            var range = Range.fromPoints(doc.indexToPosition(start), doc.indexToPosition(end));
            editor.session.remove(range);

            range.end = range.start;

            value = this.$updateTabstops(value);
            snippetManager.insertSnippet(editor, value);
        },
        getContent: function () {
            return this.ace.getValue();
        },
        getSyntax: function () {
            if (this.$syntax)
                return this.$syntax;
            var syntax = this.ace.session.$modeId.split("/").pop();
            if (syntax == "html" || syntax == "php") {
                var cursor = this.ace.getCursorPosition();
                var state = this.ace.session.getState(cursor.row);
                if (typeof state != "string")
                    state = state[0];
                if (state) {
                    state = state.split("-");
                    if (state.length > 1)
                        syntax = state[0];
                    else if (syntax == "php")
                        syntax = "html";
                }
            }
            return syntax;
        },
        getProfileName: function () {
            var resources = emmet.resources || emmet.require("resources");
            switch (this.getSyntax()) {
                case "css":
                    return "css";
                case "xml":
                case "xsl":
                    return "xml";
                case "html":
                    var profile = resources.getVariable("profile");
                    if (!profile)
                        profile = this.ace.session.getLines(0, 2).join("").search(/<!DOCTYPE[^>]+XHTML/i) != -1 ? "xhtml" : "html";
                    return profile;
                default:
                    var mode = this.ace.session.$mode;
                    return mode.emmetConfig && mode.emmetConfig.profile || "xhtml";
            }
        },
        prompt: function (title) {
            return prompt(title); // eslint-disable-line no-alert
        },
        getSelection: function () {
            return this.ace.session.getTextRange();
        },
        getFilePath: function () {
            return "";
        },
        $updateTabstops: function (value) {
            var base = 1000;
            var zeroBase = 0;
            var lastZero = null;
            var ts = emmet.tabStops || emmet.require('tabStops');
            var resources = emmet.resources || emmet.require("resources");
            var settings = resources.getVocabulary("user");
            var tabstopOptions = {
                tabstop: function (data) {
                    var group = parseInt(data.group, 10);
                    var isZero = group === 0;
                    if (isZero)
                        group = ++zeroBase;
                    else
                        group += base;

                    var placeholder = data.placeholder;
                    if (placeholder) {
                        placeholder = ts.processText(placeholder, tabstopOptions);
                    }

                    var result = '${' + group + (placeholder ? ':' + placeholder : '') + '}';

                    if (isZero) {
                        lastZero = [data.start, result];
                    }

                    return result;
                },
                escape: function (ch) {
                    if (ch == '$') return '\\$';
                    if (ch == '\\') return '\\\\';
                    return ch;
                }
            };

            value = ts.processText(value, tabstopOptions);

            if (settings.variables['insert_final_tabstop'] && !/\$\{0\}$/.test(value)) {
                value += '${0}';
            } else if (lastZero) {
                var common = emmet.utils ? emmet.utils.common : emmet.require('utils');
                value = common.replaceSubstring(value, '${0}', lastZero[0], lastZero[1]);
            }

            return value;
        }
    };


    var keymap = {
        expand_abbreviation: {"mac": "ctrl+alt+e", "win": "alt+e"},
        match_pair_outward: {"mac": "ctrl+d", "win": "ctrl+,"},
        match_pair_inward: {"mac": "ctrl+j", "win": "ctrl+shift+0"},
        matching_pair: {"mac": "ctrl+alt+j", "win": "alt+j"},
        next_edit_point: "alt+right",
        prev_edit_point: "alt+left",
        toggle_comment: {"mac": "command+/", "win": "ctrl+/"},
        split_join_tag: {"mac": "shift+command+'", "win": "shift+ctrl+`"},
        remove_tag: {"mac": "command+'", "win": "shift+ctrl+;"},
        evaluate_math_expression: {"mac": "shift+command+y", "win": "shift+ctrl+y"},
        increment_number_by_1: "ctrl+up",
        decrement_number_by_1: "ctrl+down",
        increment_number_by_01: "alt+up",
        decrement_number_by_01: "alt+down",
        increment_number_by_10: {"mac": "alt+command+up", "win": "shift+alt+up"},
        decrement_number_by_10: {"mac": "alt+command+down", "win": "shift+alt+down"},
        select_next_item: {"mac": "shift+command+.", "win": "shift+ctrl+."},
        select_previous_item: {"mac": "shift+command+,", "win": "shift+ctrl+,"},
        reflect_css_value: {"mac": "shift+command+r", "win": "shift+ctrl+r"},

        encode_decode_data_url: {"mac": "shift+ctrl+d", "win": "ctrl+'"},
        expand_abbreviation_with_tab: "Tab",
        wrap_with_abbreviation: {"mac": "shift+ctrl+a", "win": "shift+ctrl+a"}
    };

    var editorProxy = new AceEmmetEditor();
    exports.commands = new HashHandler();
    exports.runEmmetCommand = function runEmmetCommand(editor) {
        if (this.action == "expand_abbreviation_with_tab") {
            if (!editor.selection.isEmpty())
                return false;
            var pos = editor.selection.lead;
            var token = editor.session.getTokenAt(pos.row, pos.column);
            if (token && /\btag\b/.test(token.type))
                return false;
        }
        try {
            editorProxy.setupContext(editor);
            var actions = emmet.actions || emmet.require("actions");

            if (this.action == "wrap_with_abbreviation") {
                return setTimeout(function () {
                    actions.run("wrap_with_abbreviation", editorProxy);
                }, 0);
            }

            var result = actions.run(this.action, editorProxy);
        } catch (e) {
            if (!emmet) {
                var loading = exports.load(runEmmetCommand.bind(this, editor));
                if (this.action == "expand_abbreviation_with_tab")
                    return false;
                return loading;
            }
            editor._signal("changeStatus", typeof e == "string" ? e : e.message);
            config.warn(e);
            result = false;
        }
        return result;
    };

    for (var command in keymap) {
        exports.commands.addCommand({
            name: "emmet:" + command,
            action: command,
            bindKey: keymap[command],
            exec: exports.runEmmetCommand,
            multiSelectAction: "forEach"
        });
    }

    exports.updateCommands = function (editor, enabled) {
        if (enabled) {
            editor.keyBinding.addKeyboardHandler(exports.commands);
        } else {
            editor.keyBinding.removeKeyboardHandler(exports.commands);
        }
    };

    exports.isSupportedMode = function (mode) {
        if (!mode) return false;
        if (mode.emmetConfig) return true;
        var id = mode.$id || mode;
        return /css|less|scss|sass|stylus|html|php|twig|ejs|handlebars/.test(id);
    };

    exports.isAvailable = function (editor, command) {
        if (/(evaluate_math_expression|expand_abbreviation)$/.test(command))
            return true;
        var mode = editor.session.$mode;
        var isSupported = exports.isSupportedMode(mode);
        if (isSupported && mode.$modes) {
            try {
                editorProxy.setupContext(editor);
                if (/js|php/.test(editorProxy.getSyntax()))
                    isSupported = false;
            } catch (e) {
            }
        }
        return isSupported;
    };

    var onChangeMode = function (e, target) {
        var editor = target;
        if (!editor)
            return;
        var enabled = exports.isSupportedMode(editor.session.$mode);
        if (e.enableEmmet === false)
            enabled = false;
        if (enabled)
            exports.load();
        exports.updateCommands(editor, enabled);
    };

    exports.load = function (cb) {
        if (typeof emmetPath !== "string") {
            config.warn("script for emmet-core is not loaded");
            return false;
        }
        config.loadModule(emmetPath, function () {
            emmetPath = null;
            cb && cb();
        });
        return true;
    };

    exports.AceEmmetEditor = AceEmmetEditor;
    config.defineOptions(Editor.prototype, "editor", {
        enableEmmet: {
            set: function (val) {
                this[val ? "on" : "removeListener"]("changeMode", onChangeMode);
                onChangeMode({enableEmmet: !!val}, this);
            },
            value: true
        }
    });

    exports.setCore = function (e) {
        if (typeof e == "string")
            emmetPath = e;
        else
            emmet = e;
    };
});
(function () {
    ace.require(["ace/ext/emmet"], function (m) {
        if (typeof module == "object" && typeof exports == "object" && module) {
            module.exports = m;
        }
    });
})();
            