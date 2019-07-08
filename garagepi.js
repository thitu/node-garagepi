require('dotenv').load();

var startTakingSnaps = false;
var echoBearerToken = 'Bearer ' + process.env.laravel_echo_token;
var state = 'closed';

var fs = require('fs');
var path = require('path');
var https = require('https');
var os = require('os');
var logger = require('morgan');
var bodyParser = require('body-parser');
var GPIO = require('onoff').Gpio;
var express = require('express');
var app = express();

var httpsOptions = {
  key: fs.readFileSync(process.env.ssl_key),
  cert: fs.readFileSync(process.env.ssl_cert)
};

var server = require('https').createServer(httpsOptions, app);
var io = require('socket.io')(server);

var ioClient = require('socket.io-client')(process.env.laravel_echo_endpoint);
var ioClientAuth = {
  auth: {
    headers: { 'Authorization': echoBearerToken }
  }
};

ioClient.emit('subscribe', { channel: 'garage', ioClientAuth
  }).on('toggle', function(channel, data) {
    trusonafication();
});

require('console-stamp')(console, '[HH:MM:ss]');


// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.engine('html', require('ejs').renderFile);

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function(req, res) {
  res.setHeader('X-Frame-Options', 'ALLOW-FROM https://' + process.env.framing_domain);
  res.setHeader('Content-Security-Policy', "frame-ancestors https://" + process.env.framing_domain);
  res.render('index.html');
});

app.get('/api/clickbutton', function (req, res) {
  trusonafication();
});

app.get('/api/status', function (req, res) {
  res.setHeader('X-Frame-Options', 'ALLOW-FROM https://' + process.env.framing_domain);
  res.setHeader('Content-Security-Policy', "frame-ancestors https://" + process.env.framing_domain);
  res.setHeader('Content-Type', 'application/json');

  res.end(JSON.stringify({state: state}));
  console.log('returning state: ', state);
});


function garageSuccess() {
  outputSequence(7, '10', 1500);
}

function outputSequence(pin, seq, timeout) {
  var gpio = new GPIO(4, 'out');
  gpioWrite(gpio, pin, seq, timeout);
}

function gpioWrite(gpio, pin, seq, timeout) {
  if (!seq || seq.length <= 0) {
    console.log('closing pin:', pin);
    gpio.unexport();
    return;
  }

  var value = seq.substr(0, 1);
  seq = seq.substr(1);
  setTimeout(function () {
    console.log('gpioWrite, value:', value, ' seq:', seq);
    gpio.writeSync(value);
    gpioWrite(gpio, pin, seq, timeout);
  }, timeout);
}

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});


function trusonafication() {
  const { spawn } = require('child_process');
  const trusonafy = spawn(process.env.trusona, [ "--user", process.env.trusona_user ]);

  trusonafy.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });

  trusonafy.stderr.on('data', (data) => {
    console.log(`stderr: ${data}`);
  });

  trusonafy.on('close', (code) => {
    if(code === 0) {
      garageSuccess();
    }
  });
}

function uploadSnap(file) {
  var cmd = process.env.upload_command;
  var exec = require('child_process').exec;

  exec(cmd, function (error, stdout, stderr) {
    if (!error) {
      console.log('upload success: ', file);
    }
    else {
      console.log('exec error: ', error);
    }
  });
}

function takeSnaps() {
  return setTimeout(function () {
  var imgPath = path.join(__dirname, 'public/images/', 'garage.png');
  var cmd = 'raspistill -vf -hf -w 640 -h 480 -ex auto -q 100 -e png -o ' + imgPath;
  var exec = require('child_process').exec;

    exec(cmd, function (error, stdout, stderr) {
      if(!error) {
        uploadSnap(imgPath);
      }
      else {
        console.log('exec error: ' + error);
        return;
      }
      io.emit('snapshot', 'ready');
      console.log('snapshot created...');
      if (startTakingSnaps) {
        takeSnaps();
      }
    });
  }, 0);
}

io.on('connection', function (socket) {
  var ip = socket.handshake.address;
  console.log('a user connected from ', ip);
  startTakingSnaps = true;
  takeSnaps();

  socket.on('disconnect', function () {
    console.log('user disconnected at ', ip);
    startTakingSnaps = false;
  });
});

server.listen(process.env.run_on_port, function () {
  console.log('GaragePi listening on port:', process.env.run_on_port);
});
