const url = `${window.location.protocol}//${window.location.hostname}:5000`;
//let url = `http://raspib.local:5000`;
const control_action = $('.control_action');
const query_table = $("#query_results");
const editor = ace.edit("editor");


$(function () {
    editor.session.setMode("ace/mode/sql");
    document.getElementById('editor').style.fontSize='16px';
    set_event_actions();
});


function set_event_actions() {

    control_action.on('click', function () {
        switch (this.id) {
            case 'query_action':
                get_query();
                break;
            case 'clear_query_action':
                clear_query();
                break;
            default:
                console.log(this.id);
                break;
        }
    });

    //shift enter for query
    $('#editor').on('keypress', function (e) {
        if (e.which === 13 && e.shiftKey) {
            e.preventDefault();
            get_query();
        }
    });
}


function get_query() {

    const query = editor.getValue();

    $.post(`${url}/query`, {'query': query}, (data) => {
        generate_table(data.data);
    });

}

function clear_query() {
    //Can't seem to get this to work
    //editor.setValue = " ";
    query_table.bootstrapTable('destroy');
    document.getElementById('query_head').innerHTML = '';
}


function generate_table(data) {
    //TODO: add checking
    query_table.bootstrapTable('destroy');
    document.getElementById('query_head').innerHTML = '';
    if (data.length > 0) {
        const keys = Object.keys(data[0]);
        let th = '<tr id="head_row">';
        keys.forEach(element => {
            th += `<th data-field="${element}" data-sortable="true">${element}</th>`;
        });
        th += '</tr>';
        document.getElementById('query_head').innerHTML = th;
        if(data.length > 10) {
            query_table.bootstrapTable({data: data, search: true, pagination: true});
        } else {
            query_table.bootstrapTable({data: data});
        }
    }
}




















