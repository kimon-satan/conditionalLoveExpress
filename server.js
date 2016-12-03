
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
const Threads = db.get('Threads'); //This might become a variable ?


const allOptions = {
    state: 0,
    isSplat: false,
    maxState: 5,
    envTime: 8
}

//clear the Databases - temporary
UserData.remove({});
Threads.remove({});
UserGroups.remove({});
Presets.remove({});

//check the various collections exist if not create them

Presets.findOne({type: "play", name: "default"}).then((doc)=> {

  if(doc == null)
  {
     console.log("creating default parameters");
     Presets.insert({name: "default", options: allOptions});
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
      parseOptions(msg.args, function(options){

        getThread(msg.args, {id: msg.cli_id, mode: msg.mode, thread: msg.thread}, function(uids){

          options.mode = msg.mode;

          if(uids != null)
          {
            uids.forEach(function(e){
              players.to(e).emit('cmd', {cmd: 'change_mode', value: options});
            });
          }

        });

      })

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
    else if(msg.cmd == "list_threads")
    {
      listThreads( msg.args, {id: msg.cli_id, mode: msg.mode, thread: msg.thread}, function(r){

          admin.emit('server_report', {id: msg.cli_id, thread: msg.thread, isproc: msg.isproc , msg: r}); //same thread response

      })
    }
    else if(msg.cmd == "kill_thread")
    {
      Threads.remove({thread: msg.thread},{},function(e,r){
          if(e == null)
          {
            admin.emit('server_report', {id: msg.cli_id , msg: "thread: " +  msg.thread + " removed" });
          }
          else
          {
            admin.emit('server_report', {id: msg.cli_id , msg: "thread: " +  msg.thread + " can't be found" });
          }
      });

      UserData.update({},{$pull: {threads: msg.thread}},{multi: true} );
    }
    else if(msg.cmd == "kill_threads")
    {
      Threads.remove({},{},function(){
        admin.emit('server_report', {id: msg.cli_id , msg: "all threads removed" });
      });

      UserData.update({},{$set: {threads: []}},{multi: true} );
    }
    else if(msg.cmd == "get_threads")
    {
      Threads.find({}).then((docs)=>
      {
        if(docs.length < 1)
        {
          admin.emit('server_report', {id: msg.cli_id, msg: "there are no threads"});
        }
        else
        {
          var res = [];
          for(var i = 0; i < docs.length; i++)
          {
            res.push(docs[i].thread);
          }
          admin.emit('server_report', {id: msg.cli_id, suslist: res, susmode: "thread", selected: msg.thread});
        }

      });
    }
    else if(msg.cmd == "create_thread")
    {
      getThread(msg.args, {id: msg.cli_id, mode: msg.mode, thread: msg.thread}, function(population){});
    }
    else if(msg.cmd == "group")
    {

      if(!msg.args)
      {
        admin.emit('server_report', {id: msg.cli_id, msg: ""});
        return;
      }

      var name = undefined;

      if(msg.args[0].substring(0,1) != "-")
      {
        name = msg.args[0];
        msg.args.splice(0,1);
      }

      if(msg.args[0] == "-d")
      {

        var s_args = {};
        s_args.orig = msg.args[1];
        s_args.numGps = parseInt(msg.args[2]);
        //Meteor.call("createSubGroups", Meteor.user()._id, s_args, function(e,r){cli.cmdReturn(e,r)});

      }
      else if(msg.args[0] == "-r")
      {

        if(name == undefined)
        {
          UserGroups.remove({});
          UserData.update({},{$set: {groups: []}},{multi: true});
          admin.emit('server_report', {id: msg.cli_id, msg: "all groups removed"});
        }
        else
        {
          UserGroups.remove({name: name});
          UserData.update({},{$pull: {groups: name}},{multi: true});
          admin.emit('server_report', {id: msg.cli_id, msg:  name + " removed"});
        }

      }else{

        //remove references to the group in any other players
        UserData.update({},{$pull:{groups: name}},{multi: true}, function(){

          createGroup(name, msg.args, {thread: msg.thread}, function(rsp)
          {
              admin.emit('server_report', {id: msg.cli_id, msg: rsp});
          });
        });


      }
    }
    else if(msg.cmd == "list_groups")
    {
      var results = "";

      UserGroups.find({}).then((docs)=>
      {


        if(docs != null){
          docs.forEach(function(e)
          {

            var str = e.name + " :: " + e.members.length;
            results += str + "\n";

          });

        }

        admin.emit('server_report', {id: msg.cli_id, msg: results});

      });

    }
    else if(msg.cmd == "set_params")
    {
      parseOptions(msg.args, function(options)
      {
        var selector = parseFilters(msg.args, {id: msg.cli_id, mode: msg.mode, thread: msg.thread});

        admin.emit('server_report', {id: msg.cli_id, msg: ""});

        if(selector)
        {

          var searchObj = generateSearchObj(selector);
          selectPlayers(searchObj, function(uids)
          {
            uids.forEach(function(e)
            {
              players.to(e).emit('cmd', {cmd: 'set_params', value: options});
            });
          })

        }else{

          if(msg.thread != undefined)
          {
            Threads.find({thread: msg.thread}, 'population').then((docs)=>{

              if(docs == null)return;

              docs[0].population.forEach(function(e){
                players.to(e).emit('cmd', {cmd: 'set_params', value: options});
              });

            });
          }
        }
      });


    }


    //console.log('admin command: ' , msg);

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

    //make all options

    var usrobj = {
        mode: "wait",
        threads: [],
        groups: []
    }

    Object.keys(allOptions).forEach(function(e){
      usrobj[e] = allOptions[e];
    })

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

  var selector = parseFilters(args, cli);
  if(!selector)selector = {};
  var so = generateSearchObj(selector);

  //number filters don't work here

  var results = "";

  UserData.find(so).then((docs)=>
  {

    docs.forEach(function(e)
    {
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

function listThreads(args, cli, cb)
{

  var results = "";

  Threads.find({}).then((docs)=>
  {

    docs.forEach(function(e)
    {

      var str = e.thread + " :: " + e.population.length;
      if(e.thread == cli.thread)str += " *";
      if(e.thread == cli.temp_thread)str += " -";

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

function addThreadToPlayers(args, cb)
{

		if(typeof(args) == "undefined")return false;

		selectPlayers(args, function(uids){

      var msg =  args.mode + " with " + uids.length + " players with thread: " + args.thread; //this message needs to change

      //this is all a bit messy but it sort of works
      UserData.update({},{$pull:{groups: args.group}},{multi: true}, function(){

        uids.forEach(function(e){

            UserData.update({_id: e},{$push: {threads: args.thread}});

            if(typeof(args.group) != "undefined")
            {
              UserData.update({_id: e},{$push: {groups: args.group}});
            }

        })

      });

  		Threads.insert({thread: args.thread, population: uids},{}, function(){

        if(typeof(args.group) != "undefined")
        {
            UserGroups.update({name: args.group}, {$set: {members: uids}}, {upsert: true});
            msg += "\n these players will now be called " + args.group;
        }
        cb(msg);

      });

    });

};

function createGroup(name, args, cli, cb)
{
  var selector = parseFilters(args, {thread: cli.thread});

  if(!selector && cli.thread){
    selector = { filters: [ { not: false, mode: 'thread', thread: cli.thread } ] } //search for players on the current thread
  }

  selector.group = name;

  if(selector && selector.group){

    selectPlayers(selector, function(uids){

      uids.forEach(function(e)
      {
        UserData.update({_id: e},{$push: {groups: selector.group}});
      });

      UserGroups.update({name: selector.group}, {$set: {members: uids}}, {upsert: true});

      var rsp = uids.length + " players will now be called " + selector.group;
      cb(rsp);

    });


  }else{
    cb("");
  }

}

function getThread(args, cli, send)
{

  var selector = parseFilters(args, cli);

  if(selector)
  {

    selector.thread = generateTempId(5); //needs to be passed back to cli
    selector.mode = cli.mode;

    addThreadToPlayers(selector, function(msg){

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


function parseFilters(args, cli){

  if(!args)return false;

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

          case undefined:
          break;

          default:

            if(!isNaN(args[i]))
            {
              selector.numPlayers = parseInt(args[i]);
            }
            else
            {
              filter.mode = "group"; //assume it's a group
              filter.group = args[i];
            }
        }


        args.splice(i, 1);
        selector.filters.push(filter);

      })();

    }
    else if(args[i] == "-g")
    {
      args.splice(i,1);
      selector.group = args[i];
      args.splice(i,1);
    }
    else
    {
      //could add parsing text to ignore other arguments
      //assume it's a group and that it exists
      if(typeof(selector.filters) == "undefined")selector.filters = [];
      var filter = {mode: "group", group: args[i]};
      selector.filters.push(filter);
      args.splice(i, 1);
    }
  }

  if(typeof(selector.filters) == "undefined")
  {
      selector = false; //there are no selectors
  }

  return selector;
}


//we don't need this for the moment

function parseOptions(args, cb)
{

  //parses options into an object

  var options = {};

  if(args.length == 0)
  {
    return options;
  }

  i = args.indexOf("-time");

  if(i > -1){
    args.splice(i,1);
    options["time"] = parseInt(args[i]);
    args.splice(i,1);
  }

  //We need the current options for the CLI to do this
  var params = Object.keys(allOptions);

  for(var x = 0; x < params.length; x++)
  {
      i = args.indexOf("-" + params[x]);
      if(i > -1)
      {
        args.splice(i,1);
        if(args[i].substring(0,1) == "[")
        {
          //repackage as an array
          args[i] = args[i].substring(1, args[i].length -1);
          options[params[x]] = args[i].split(",");

        }
        else if(args[i].substring(0,1) == "(")
        {
          //repackage as an object
          args[i] = args[i].substring(1, args[i].length -1);
          var ar = args[i].split(",");
          options[params[x]] = {min: parseFloat(ar[0]), max: parseFloat(ar[1])};
        }
        else
        {
          options[params[x]] = isNumber(args[i]) ? parseFloat(args[i]) : args[i];
          if(options[params[x]] == "T")options[params[x]] = true; //handle booleans
          if(options[params[x]] == "F")options[params[x]] = false;
        }

        args.splice(i,1);
      }
  }

  loadPresets(args, options, function(res)
  {

      //saving presets will go here
      cb(options);

  });

  //saving presets

  // i = args.indexOf("-s");
  //
  // if(i > -1){
  //   args.splice(i,1);
  //   Meteor.call("createPreset", Meteor.user()._id, {type: type, name: args[i], options: options},function(e,r){cli.cmdReturn(e,r)});
  //   args.splice(i,1);
  //
  // }else{
  //   //cli.newCursor();
  // }

  //we need to add code to check current options

  // for(var i in options){
  //   gCurrentOptions[type][i] = options[i]; //copy the changes to current options
  // }



}

function loadPresets(args, options, cb)
{
  var i = args.indexOf("-p");

  if(i > -1)
  {
      args.splice(i,1);

      Presets.findOne({type: type, name: args[i]}).then((doc)=>{

        if(doc)
        {

          var preset = doc.options;
          if(preset)
          {
            for(var x in preset)
            {
              options[x] = preset[x];
            }
          }

        }

        args.splice(i,1);
        loadPresets(args, options, cb);

      });
  }
  else
  {
    cb(options);
  }

}