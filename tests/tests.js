//create 100 players to work with
var players = [];

$(document).ready(function()
{
	for(var i = 0; i < 100; i++)
	{
		n = new Player(true);
		n.tableid = 'player_' + i;
		n.updateTable = updateTable;
		players.push(n);
		$('#usertable').append('<tr id ="' + n.tableid + '" ><td>'+ i +'</td></tr>')
	}

});

function updateTable (tableid , data)
{
	$('#' + tableid).empty();
	$('#' + tableid).append('<td>'+ data._id +'</td>')
	$('#' + tableid).append('<td>'+ data.mode +'</td>')
	if(this.data.mode == "chat")$('#' + tableid).append('<td>'+ data.chatText +'</td>')
}