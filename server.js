/*
TODO

list the current users & their state
//could have a refresh function
... actually just make wait mode send a refreshed record new connections ?
... how to avoid doubling up of signals ?
//mobile test
//probably can move on to integrated verison now

*/

//Express initializes app to be a function handler that you can supply to an HTTP server

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

require('./libs/utils.js'); //include the global utils functions

//simple db using monk & mongodb
const url = 'localhost:27017/ConditionalLove';
const monk = require('monk');
const db = monk(url);

db.then(() => {
  console.log('Connected correctly to server')
})

const UserData = db.get('UserData');
const UserGroups = db.get('UserGroups');
const Presets = db.get('Presets');
const Threads = db.get('Threads');


//clear the Databases - temporary
UserData.remove({});
Threads.remove({});
UserGroups.remove({});

//check the various collections exist if not create them

Presets.findOne({type: "play", name: "df"}).then((doc)=> {

  if(doc == null)
  {

      console.log("creating play defaults");
      //create one
      var p = {
          state: 0,
          isSplat: false,
          maxState: 5,
          envTime: 8
      }

     Presets.insert({type: "play", name: "df", options: p});
  }

});




//We define a route handler / that gets called when we hit our website home.

app.use("/admin",express.static(__dirname + "/admin"));
app.use("/style",express.static(__dirname + "/style"));
app.use("/libs",express.static(__dirname + "/libs"));
app.use("/player",express.static(__dirname + "/player"));
app.use("/samples",express.static(__dirname + "/samples"));

//two types of user
 app.get('/admin', function(req, res){
   res.sendFile(__dirname + '/admin/admin.html');
 });
//
 app.get('/', function(req, res){
   res.sendFile(__dirname + '/player/player.html');
 });


var admin = io.of('/admin');

admin.on('connection', function(socket){

  console.log('an admin connected');

  socket.on('cmd', function(msg)
  {

    //console.log(msg);

    if(msg.cmd == "change_mode")
    {
      permThread(msg.mode , msg.args, {id: msg.cli_id, mode: msg.mode, thread: msg.thread}, function(population){

        population.forEach(function(e){
          console.log(e);
          players.to(e).emit('cmd', {cmd: 'change_mode', value: msg.mode});
        });

      });
    }
    else if(msg.cmd == "chat_update")
    {
      Threads.find({thread: msg.thread}, 'population').then((docs)=>{

        if(docs == null)return;

        docs[0].population.forEach(function(e){
          players.to(e).emit('cmd', {cmd: 'chat_update', value: msg.value});
        });

      });
    }
    else if(msg.cmd == "chat_clear")
    {
      Threads.find({thread: msg.thread}, 'population').then((docs)=>{

        if(docs == null)return;

        docs[0].population.forEach(function(e){
          players.to(e).emit('cmd', {cmd: 'chat_clear'});
        });

      });
    }
    else if(msg.cmd == "chat_newline")
    {
      Threads.find({thread: msg.thread}, 'population').then((docs)=>{

        if(docs == null)return;

        docs[0].population.forEach(function(e){
          players.to(e).emit('cmd', {cmd: 'chat_newline'});
        });

      });
    }
    else if(msg.cmd == "list_players")
    {
      listPlayers( msg.args, {id: msg.cli_id, mode: msg.mode, thread: msg.thread}, function(r){

          admin.emit('server_report', {id: msg.cli_id, thread: msg.thread, isproc: msg.isproc , msg: r}); //same thread response

      })
    }

    console.log('admin command: ' , msg);

  });

  socket.on('disconnect', function()
  {
    console.log('an admin disconnected');
  });

});




//io is everyone
var players = io.of('/player');

players.on('connection', function(socket)
{

  console.log('a player connected ');
  socket.emit("whoareyou", "?")

  socket.on('hello', function(msg)
  {

    var usrobj = {
        state: 0,
        isSplat: false,
        maxState: 5,
        envTime: 8,
        mode: "wait"
    }


    if(msg == "new")
    {

      UserData.insert(usrobj,{}, function(err,res)
      {
        if(err) throw err;
        console.log('hello new user: ' + res._id);
        socket.join(res._id);
        socket.emit('welcome', res);
      });

    }
    else
    {

      UserData.findOne(msg,{}, function(err,res)
      {
        if(err) throw err;
        if(!res)
        {


          //insert a new user instead
          UserData.insert(usrobj, {}, function(err,res)
          {
            if(err) throw err;
            console.log('hello new user: ' + res._id);
            socket.join(res._id);
            socket.emit('welcome', res);
          });
        }
        else
        {
          console.log('welcome back user: ' + msg);
          socket.join(res._id);
          socket.emit('welcome', res);
        }

      });
    }

  });

  socket.on('update_user', function(msg)
  {
    UserData.update({_id: msg._id},{$set: msg});
  });

  socket.on('disconnect', function()
  {
    console.log('a player disconnected');
  });

});


//We make the http server listen on port 3000.
http.listen(3000, function(){
  console.log('listening on *:3000');
});


//////////////////////HELPER FUNCTIONS/////////////////////////


function listPlayers(args, cli, cb)
{
  var selector = parseFilters(args);
  if(!selector)selector = {};
  var so = generateSearchObj(selector);
  var results = "";

  UserData.find(so).then((docs)=>
  {

    docs.forEach(function(e)
    {
      console.log(e);
      var id = String(e._id);
      var str = id.substring(0,3) + "..." + id.substring(id.length -3, id.length) + ",  mode: " + e.mode;

      if(cli.mode == "play")
      {
        str += ", state: " + e.state;
        str += ", isSplat: " + e.isSplat;
        str += ", maxState: " + e.maxState;
        str += ", envTime: " + e.envTime;
      }

      results += str + "\n";

    });

    cb(results);

  });
}


function selectPlayers(args, cb){

	console.log("selecting players ... ");

	var searchObj = generateSearchObj(args);

	UserData.find(searchObj, '_id').then((docs) => {
  // only the name field will be selected

    var uids = [];

    docs.forEach(function(e)
    {
      uids.push(e._id);
    });

    if(typeof(args.numPlayers) != "undefined"){
      shuffleArray(uids);
      var numPlayers = Math.min(uids.length , args.numPlayers);
      uids = uids.slice(0,numPlayers);
    }

    cb(uids);

  });

}

function addThreadToPlayers(args, cb){

		if(typeof(args) == "undefined")return false;

		selectPlayers(args, function(uids){

      var msg =  args.mode + " with " + uids.length + " players with activeThread: " + args.thread; //this message needs to change


  		Threads.insert({thread: args.thread, population: uids},{}, function(){

        if(typeof(args.group) != "undefined")
        {
          if(UserGroups.count({name: args.group}) > 0)
          {
            UserGroups.update({name: args.group}, {$set: {members: uids}});
          }
          else
          {
            UserGroups.insert({name: args.group, members: uids});
          }

            msg += "\n these players will now be called " + args.group;
        }

        cb(msg);

      });

    });

};

function permThread(cmd, args, cli, send){

  //send is the function call to emit

  //disambiguate from temp thread

  var selector = parseFilters(args);

  //var options = parseSuOptions(args, cmd, cli); // we don't need this for the moment

  if(selector){

    selector.thread = generateTempId(5); //needs to be passed back to cli
    selector.mode = cli.mode;

    addThreadToPlayers(selector, function(msg){

      console.log(msg);
      admin.emit('server_report', {msg: msg, id: cli.id, thread: selector.thread });

      Threads.findOne({thread: selector.thread}, 'population').then((docs)=>{
          send(docs.population);
      });

    });

  }else{

    admin.emit('server_report', {id: cli.id, thread: cli.thread}); //same thread response

    Threads.findOne({thread: cli.thread}, 'population').then((docs)=>{
        send(docs.population);
    });

  }
}


function parseFilters(args){

  //parses a set of selction filters into a mongo selector

  var selector = {};

  for(var i = 0; i < args.length; ){
    if(args[i] == "-f" || args[i] == "-n"){

      if(typeof(selector.filters) == "undefined")selector.filters = [];

      (function(){
        var filter = {};
        filter.not = args[i] == "-n";
        args.splice(i,1);

        switch(args[i]){

          case "thread":
            filter.mode = "thread";
            filter.thread = cli.thread;
          break;

          case "play":
            filter.mode = "play";
          break;

          case "chat":
            filter.mode = "chat";
          break;

          case "state":
            filter.mode = "state";
            args.splice(i, 1);
            filter.state = args[i];
          break;

          default:
            if(!isNaN(args[i]))
            {
              selector.numPlayers = parseInt(args[i]);
            }
            else if(UserGroups.count({name: args[i]}) > 0)
            {
              filter.mode = "group";
              filter.group = args[i];

            }

        }

        args.splice(i, 1);
        selector.filters.push(filter);

      })();

    }else if(args[i] == "-g"){

      args.splice(i,1);
      selector.group = args[i];
      args.splice(i,1);

    }else if(UserGroups.count({name: args[i]}) > 0){

          if(typeof(selector.filters) == "undefined")selector.filters = [];
          var filter = {mode: "group", group: args[i]};
          selector.filters.push(filter);
          args.splice(i, 1);

    }else {
        i++;
    }
  }

  if(typeof(selector.filters) == "undefined")selector = false; //there are no selectors

  return selector;
}


//we don't need this for the moment

// function parseSuOptions(args, type, cli){
//
//
//   //parses options into an object
//
//   var options = {};
//
//   if(args.length == 0){
//     return options;
//   }
//
//   var i = args.indexOf("-p");
//
//   while(i > -1){
//       args.splice(i,1);
//       var preset = Presets.findOne({type: type, name: args[i]}).options;
//       if(preset){
//         for(var x in preset){
//           options[x] = preset[x];
//         }
//       }
//       args.splice(i,1);
//       i = args.indexOf("-p");
//   }
//
//
//   i = args.indexOf("-time");
//
//   if(i > -1){
//     args.splice(i,1);
//     options["time"] = parseInt(args[i]);
//     args.splice(i,1);
//   }
//
//
//
//   var params = Object.keys(gCurrentOptions[type]);
//
//   for(var x = 0; x < params.length; x++){
//       i = args.indexOf("-" + params[x]);
//       if(i > -1){
//         args.splice(i,1);
//         if(args[i].substring(0,1) == "["){
//           //repackage as an array
//           args[i] = args[i].substring(1, args[i].length -1);
//           options[params[x]] = args[i].split(",");
//
//         }else if(args[i].substring(0,1) == "("){
//           //repackage as an object
//           args[i] = args[i].substring(1, args[i].length -1);
//           var ar = args[i].split(",");
//           options[params[x]] = {min: parseFloat(ar[0]), max: parseFloat(ar[1])};
//
//
//         }else{
//           options[params[x]] = isNumber(args[i]) ? parseFloat(args[i]) : args[i];
//           if(options[params[x]] == "T")options[params[x]] = true; //handle booleans
//           if(options[params[x]] == "F")options[params[x]] = false;
//         }
//
//         args.splice(i,1);
//       }
//   }
//
//   i = args.indexOf("-s");
//
//   if(i > -1){
//     args.splice(i,1);
//     Meteor.call("createPreset", Meteor.user()._id, {type: type, name: args[i], options: options},function(e,r){cli.cmdReturn(e,r)});
//     args.splice(i,1);
//
//   }else{
//     //cli.newCursor();
//   }
//
//   for(var i in options){
//     gCurrentOptions[type][i] = options[i]; //copy the changes to current options
//   }
//
//   return options;
//
//
// }
