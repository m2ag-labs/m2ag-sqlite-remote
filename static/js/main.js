const url = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
const control_action = $('.control_action');
const query_table = $("#query_results");
const editor = ace.edit("editor");


$(function () {
    editor.session.setMode("ace/mode/sql");
    document.getElementById('editor').style.fontSize = '16px';
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

    const settings = {
        "url": `${url}/query`,
        "method": "POST",
        "dataType":"json",
        "timeout": 0,
        "headers": {
            "Content-Type": "application/json",
            "Authorization": "Basic " + btoa(document.getElementById('connect_name').value + ":" + document.getElementById('connect_password').value)
        },
        "data": JSON.stringify({'query': query})

    };

    $.ajax(settings).done((response) => {
        generate_table(response.data);
    }).fail((xhr, status, error)=>{
       // console.log(status);
        if(xhr.status === 401){
            alert('received unauthorized error -- please check login info');
        }
    })
    

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
        if (data.length > 10) {
            query_table.bootstrapTable({data: data, search: true, pagination: true});
        } else {
            query_table.bootstrapTable({data: data});
        }
    }
}




















