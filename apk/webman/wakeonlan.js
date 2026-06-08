/* Copyright (c) 2026 Cappysan. All rights reserved. */

Ext.ns('AS.ARC.apps.wakeonlan');

/**
 * @class AS.ARC.apps.wakeonlan.core
 * @extends Ext.util.Observable
 */
Ext.define('AS.ARC.apps.wakeonlan.core', {
    extend: 'Ext.util.Observable',

    apiUrl: AS.ARC.util.getUserAppsPath() + 'cappysan-wakeonlan/' + 'wakeonlan.cgi',
    imgUrl: AS.ARC.util.getUserAppsPath() + 'cappysan-wakeonlan/images/',

    constructor: function (config) {
        Ext.apply(this, config);
        this.callParent();
        this.init(config);
    },

    init: function () {
        var fn = this;

        fn.win = fn.desktop.createWindow({
            app:       fn.app,
            id:        fn.id,
            itemId:    fn.id,
            title:     '<div class="as-header" style="background-image:url(' + AS.ARC.util.fixDc('/apps/cappysan-wakeonlan/images/icon-app-task.png') + ');background-position:50%;background-repeat:no-repeat;"></div><div class="as-header-text">Wake on LAN</div>',
            width:     500,
            height:    530,
            minWidth:  500,
            minHeight: 530,
            resizable: true,
            border:    false,
            items:     [fn.getMainPanel()],
            listeners: {
                afterrender: function (win) {
                    win.header.items.items[1].hide();
                    Ps.initialize(win.body.dom);
                    fn.loadSaved();
                    fn.resizeGrid();
                },
                resize: function (win) {
                    Ps.update(win.body.dom);
                    fn.resizeGrid();
                }
            }
        });
    },

    revalidate: function () {
        var fn       = this,
            macEl    = fn.win.down('#macAddress'),
            bcastEl  = fn.win.down('#broadcast'),
            portEl   = fn.win.down('#port'),
            sendEl   = fn.win.down('#sendBtn'),
            saveEl   = fn.win.down('#saveBtn');

        if (!macEl || !sendEl) { return; }

        var macVal   = macEl.getValue().trim(),
            bcastVal = bcastEl.getValue().trim(),
            portVal  = portEl.getValue().trim(),
            macOk    = /^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$/.test(macVal),
            bcastOk  = bcastVal === '' || /^(\d{1,3}\.){3}\d{1,3}$/.test(bcastVal),
            port     = parseInt(portVal, 10),
            portOk   = portVal === '' || (!isNaN(port) && port >= 1 && port <= 65535),
            valid    = macOk && bcastOk && portOk;

        sendEl.setDisabled(!valid);
        if (saveEl) { saveEl.setDisabled(!valid); }
    },

    sendWol: function () {
        var fn     = this,
            mac    = fn.win.down('#macAddress').getValue().trim(),
            bcast  = fn.win.down('#broadcast').getValue().trim() || '255.255.255.255',
            port   = fn.win.down('#port').getValue().trim() || '9';

        fn.win.el.mask(_S('COMMON', 'APPLYING'));

        AS.ARC.ajax({
            url:    AS.ARC.util.getApiUrlWithSid(fn.apiUrl, { act: 'send' }),
            method: 'post',
            params: { mac: mac, broadcast: bcast, port: port },
            success: function (json) {
                fn.win.el.unmask();
                Ext.create('AS.ARC.msgWindow', {
                    parentWin: fn.win,
                    title:     'Wake on LAN',
                    width:     300,
                    height:    160,
                    iconType:  'info',
                    asItems:   [{ xtype: 'displayfield', value: _S('WAKEONLAN', 'PACKET_SENT') }],
                    fbar: [{ text: _S('COMMON', 'OK'), handler: function () { this.up('window').close(); } }]
                }).show();
            },
            failure: function (json) {
                fn.win.el.unmask();
                AS.ARC.util.showMsgWindow({
                    5000: _S('COMMON', 'SESSION_TIMEOUT'),
                    5302: _S('ERROR', 'INCORRECT_PARAMETER')
                }, json, fn.win);
            }
        });
    },

    /* ── Save popup ──────────────────────────────────────────── */
    showSavePopup: function () {
        var fn    = this,
            mac   = fn.win.down('#macAddress').getValue().trim(),
            bcast = fn.win.down('#broadcast').getValue().trim() || '255.255.255.255',
            port  = fn.win.down('#port').getValue().trim() || '9';

        /* check for duplicate {mac,broadcast,port} before opening */
        var grid    = fn.win.down('#savedGrid'),
            store   = grid.getStore(),
            isDup   = false;

        store.each(function (rec) {
            var recBcast = rec.get('broadcast') || '255.255.255.255',
                recPort  = rec.get('port')      || '9';
            if (rec.get('mac') === mac &&
                recBcast === bcast &&
                recPort  === port) {
                isDup = true;
                return false;
            }
        });

        var popup = Ext.create('AS.ARC.msgWindow', {
            parentWin: fn.win,
            title:     _S('WAKEONLAN', 'SAVE_TITLE'),
            width:     360,
            height:    200,
            iconType:  'info',
            asItems:   [{
                xtype:      'textfield',
                itemId:     'saveNameField',
                fieldLabel: AS.ARC.util.fontToBold(_S('WAKEONLAN', 'SAVE_NAME_LABEL')),
                labelWidth: 50,
                anchor:     '100%',
                allowBlank: false,
                listeners: {
                    change: function (field, val) {
                        var okBtn  = popup.down('#saveOkBtn'),
                            errEl  = popup.down('#saveErrMsg');
                        if (!val || !val.trim()) {
                            okBtn.setDisabled(true);
                            return;
                        }
                        okBtn.setDisabled(isDup);
                        if (errEl) { errEl.setVisible(isDup); }
                    }
                }
            }, {
                xtype:   'displayfield',
                itemId:  'saveErrMsg',
                value:   _S('WAKEONLAN', 'DUPLICATE_ENTRY'),
                cls:     'app-wakeonlan-err',
                hidden:  !isDup
            }],
            fbar: [{
                text:     _S('COMMON', 'OK'),
                itemId:   'saveOkBtn',
                disabled: isDup,
                handler: function () {
                    var nameEl  = popup.down('#saveNameField'),
                        nameVal = nameEl ? nameEl.getValue().trim() : '';
                    if (!nameVal) {
                        nameEl.markInvalid(_S('WAKEONLAN', 'SAVE_NAME_REQUIRED'));
                        return;
                    }
                    popup.close();
                    fn.doSave(nameVal, mac, bcast, port);
                }
            }, {
                text:    _S('COMMON', 'CANCEL'),
                handler: function () { popup.close(); }
            }]
        });
        popup.show();
    },

    doSave: function (name, mac, bcast, port) {
        var fn = this;
        fn.win.el.mask(_S('COMMON', 'APPLYING'));
        AS.ARC.ajax({
            url:    AS.ARC.util.getApiUrlWithSid(fn.apiUrl, { act: 'save' }),
            method: 'post',
            params: { name: name, mac: mac, broadcast: bcast, port: port },
            success: function () { fn.win.el.unmask(); fn.loadSaved(); },
            failure: function (json) {
                fn.win.el.unmask();
                AS.ARC.util.showMsgWindow({
                    5000: _S('COMMON', 'SESSION_TIMEOUT'),
                    5302: _S('ERROR', 'INCORRECT_PARAMETER')
                }, json, fn.win);
            }
        });
    },

    /* ── Rename popup ────────────────────────────────────────── */
    showRenamePopup: function () {
        var fn      = this,
            grid    = fn.win.down('#savedGrid'),
            sel     = grid.getSelectionModel().getSelection();

        if (!sel || !sel.length) { return; }

        var rec    = sel[0],
            recId  = rec.get('id');

        var popup = Ext.create('AS.ARC.msgWindow', {
            parentWin: fn.win,
            title:     _S('WAKEONLAN', 'RENAME_TITLE'),
            width:     360,
            height:    190,
            iconType:  'info',
            asItems:   [{
                xtype:      'textfield',
                itemId:     'renameNameField',
                fieldLabel: AS.ARC.util.fontToBold(_S('WAKEONLAN', 'SAVE_NAME_LABEL')),
                labelWidth: 50,
                anchor:     '100%',
                value:      rec.get('name'),
                allowBlank: false
            }],
            fbar: [{
                text:    _S('COMMON', 'OK'),
                handler: function () {
                    var nameEl  = popup.down('#renameNameField'),
                        nameVal = nameEl ? nameEl.getValue().trim() : '';
                    if (!nameVal) {
                        nameEl.markInvalid(_S('WAKEONLAN', 'SAVE_NAME_REQUIRED'));
                        return;
                    }
                    popup.close();
                    fn.doRename(recId, nameVal);
                }
            }, {
                text:    _S('COMMON', 'CANCEL'),
                handler: function () { popup.close(); }
            }]
        });
        popup.show();
    },

    doRename: function (id, name) {
        var fn = this;
        fn.win.el.mask(_S('COMMON', 'APPLYING'));
        AS.ARC.ajax({
            url:    AS.ARC.util.getApiUrlWithSid(fn.apiUrl, { act: 'rename' }),
            method: 'post',
            params: { id: id, name: name },
            success: function () { fn.win.el.unmask(); fn.loadSaved(); },
            failure: function (json) {
                fn.win.el.unmask();
                AS.ARC.util.showMsgWindow({
                    5000: _S('COMMON', 'SESSION_TIMEOUT'),
                    5302: _S('ERROR', 'INCORRECT_PARAMETER')
                }, json, fn.win);
            }
        });
    },

    /* ── Remove ──────────────────────────────────────────────── */
    doRemove: function () {
        var fn   = this,
            grid = fn.win.down('#savedGrid'),
            sel  = grid.getSelectionModel().getSelection();

        if (!sel || !sel.length) { return; }

        var id = sel[0].get('id');
        fn.win.el.mask(_S('COMMON', 'APPLYING'));
        AS.ARC.ajax({
            url:    AS.ARC.util.getApiUrlWithSid(fn.apiUrl, { act: 'remove' }),
            method: 'post',
            params: { id: id },
            success: function () {
                fn.win.el.unmask();
                fn.win.down('#renameBtn').setDisabled(true);
                fn.win.down('#removeBtn').setDisabled(true);
                fn.loadSaved();
            },
            failure: function (json) {
                fn.win.el.unmask();
                AS.ARC.util.showMsgWindow({
                    5000: _S('COMMON', 'SESSION_TIMEOUT'),
                    5302: _S('ERROR', 'INCORRECT_PARAMETER')
                }, json, fn.win);
            }
        });
    },

    /* ── Resize grid to fill remaining space ─────────────────── */
    resizeGrid: function () {
        var fn   = this,
            grid = fn.win.down('#savedGrid');
        if (!grid || !grid.el) { return; }

        var gridTop = grid.el.getY(),
            winBot  = fn.win.body.getY() + fn.win.body.getHeight(),
            newH    = winBot - gridTop - 20;

        if (newH < 100) { newH = 100; }
        grid.setHeight(newH);
    },

    /* ── Load list ───────────────────────────────────────────── */
    loadSaved: function () {
        var fn   = this,
            grid = fn.win.down('#savedGrid');
        if (!grid) { return; }
        AS.ARC.ajax({
            url:    AS.ARC.util.getApiUrlWithSid(fn.apiUrl, { act: 'list' }),
            method: 'get',
            success: function (json) {
                var entries = (json && json.data) ? json.data : [];
                grid.getStore().loadData(entries);
            },
            failure: function () {}
        });
    },

    /* ── Panel ───────────────────────────────────────────────── */
    getMainPanel: function () {
        var fn = this;

        return Ext.create('AS.ARC.formBase', {
            itemId:    'main',
            cls:       'app-wakeonlan as-page-panel',
            height:    '100%',
            border:    false,
            isDiscard: false,
            items: [{
                xtype:    'fieldset',
                itemId:   'sendSection',
                title:    _S('WAKEONLAN', 'SEND'),
                defaults: { labelWidth: 100, msgTarget: AS.ARC.config.msgTarget },
                items: [{
                    xtype:      'textfield',
                    itemId:     'macAddress',
                    fieldLabel: AS.ARC.util.fontToBold(_S('WAKEONLAN', 'MAC_ADDRESS')),
                    width:      380,
                    allowBlank: false,
                    maskRe:     /[0-9a-fA-F:\-]/,
                    msgTarget:  AS.ARC.config.msgTarget,
                    validator: function (value) {
                        if (value === '') { return true; }
                        return /^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$/.test(value)
                            || _S('WAKEONLAN', 'INVALID_MAC');
                    },
                    listeners: { change: function () { fn.revalidate(); } }
                }, {
                    xtype:      'textfield',
                    itemId:     'broadcast',
                    fieldLabel: AS.ARC.util.fontToBold(_S('WAKEONLAN', 'BROADCAST')),
                    width:      380,
                    emptyText:  '255.255.255.255',
                    msgTarget:  AS.ARC.config.msgTarget,
                    validator: function (value) {
                        if (value === '') { return true; }
                        return /^(\d{1,3}\.){3}\d{1,3}$/.test(value)
                            || _S('WAKEONLAN', 'INVALID_IP');
                    },
                    listeners: { change: function () { fn.revalidate(); } }
                }, {
                    xtype:      'textfield',
                    itemId:     'port',
                    fieldLabel: AS.ARC.util.fontToBold(_S('WAKEONLAN', 'PORT')),
                    width:      380,
                    emptyText:  '9',
                    maskRe:     /[0-9]/,
                    msgTarget:  AS.ARC.config.msgTarget,
                    validator: function (value) {
                        if (value === '') { return true; }
                        var n = parseInt(value, 10);
                        return (!isNaN(n) && n >= 1 && n <= 65535)
                            || _S('WAKEONLAN', 'INVALID_PORT');
                    },
                    listeners: { change: function () { fn.revalidate(); } }
                }, {
                    xtype:  'container',
                    layout: 'hbox',
                    style:  'margin-top: 10px; margin-left: 105px',
                    items: [{
                        xtype:    'button',
                        itemId:   'saveBtn',
                        text:     _S('WAKEONLAN', 'SAVE_BUTTON'),
                        disabled: true,
                        style:    'margin-right: 6px',
                        handler:  function () { fn.showSavePopup(); }
                    }, {
                        xtype:    'button',
                        itemId:   'sendBtn',
                        text:     _S('WAKEONLAN', 'SEND_BUTTON'),
                        disabled: true,
                        cls:      'app-wakeonlan-send-btn',
                        handler:  function () { fn.sendWol(); }
                    }]
                }]
            }, {
                xtype:  'fieldset',
                itemId: 'savedSection',
                title:  _S('WAKEONLAN', 'SAVED_SECTION'),
                items: [{
                    xtype:  'container',
                    layout: 'hbox',
                    style:  'margin-bottom: 8px',
                    items: [{
                        xtype:    'button',
                        itemId:   'renameBtn',
                        text:     _S('WAKEONLAN', 'RENAME_BUTTON'),
                        disabled: true,
                        style:    'margin-right: 6px',
                        handler:  function () { fn.showRenamePopup(); }
                    }, {
                        xtype:    'button',
                        itemId:   'removeBtn',
                        text:     _S('WAKEONLAN', 'REMOVE_BUTTON'),
                        disabled: true,
                        handler:  function () { fn.doRemove(); }
                    }]
                }, {
                    xtype:   'grid',
                    itemId:  'savedGrid',
                    border:  true,
                    store: Ext.create('Ext.data.Store', {
                        fields: ['id', 'name', 'mac', 'broadcast', 'port'],
                        data:   []
                    }),
                    columns: [{
                        text:      _S('WAKEONLAN', 'COL_NAME'),
                        dataIndex: 'name',
                        flex:      1
                    }, {
                        text:      _S('WAKEONLAN', 'COL_MAC'),
                        dataIndex: 'mac',
                        flex:      1
                    }, {
                        text:      _S('WAKEONLAN', 'COL_BROADCAST'),
                        dataIndex: 'broadcast',
                        flex:      1
                    }, {
                        text:      _S('WAKEONLAN', 'COL_PORT'),
                        dataIndex: 'port',
                        width:     60
                    }],
                    height: 160,
                    listeners: {
                        selectionchange: function (selModel, selected) {
                            var hasSelection = selected && selected.length > 0;
                            fn.win.down('#renameBtn').setDisabled(!hasSelection);
                            fn.win.down('#removeBtn').setDisabled(!hasSelection);

                            if (hasSelection) {
                                var rec = selected[0];
                                fn.win.down('#macAddress').setValue(rec.get('mac'));
                                fn.win.down('#broadcast').setValue(rec.get('broadcast'));
                                fn.win.down('#port').setValue(rec.get('port'));
                            }
                        }
                    }
                }]
            }]
        });
    }
});


/**
 * @class AS.ARC.apps.wakeonlan.main
 * @extends AS.ARC._appBase
 */
Ext.define('AS.ARC.apps.wakeonlan.main', {
    extend:     'AS.ARC._appBase',
    appTag:     'cappysan-wakeonlan',
    title:      'Wake on LAN',
    appMaxNum:  1,
    appOpenNum: 0,
    appIsReady: true,
    appWins:    [],

    createWindow: function () {
        var desktop = this.core.getDesktop(),
            app     = this;

        if ((this.appOpenNum === this.appMaxNum) || !this.appIsReady) {
            this.appWins[0].show();
            return;
        }

        this.appIsReady = false;

        var wol = Ext.create('AS.ARC.apps.wakeonlan.core', {
            app:     this,
            desktop: desktop,
            id:      this.id + '-' + Ext.id()
        });

        wol.win.on('render', function () {
            app.appOpenNum++;
            app.appIsReady = true;
        });

        wol.win.on('beforeclose', function () {
            app.appOpenNum--;
            app.appIsReady = true;
            app.appWins.pop();
        });

        wol.win.show();
        this.appWins.push(wol.win);
        return wol.win;
    }
});
