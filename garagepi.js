require('dotenv').load();

var startTakingSnaps = false;

var path = require('path');
var os = require('os');
var csurf = require('csurf');
var logger = require('morgan');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var GPIO = require('onoff').Gpio;
var express = require('express');
var app = express();
var rateLimit = require('express-rate-limit');
var server = require('http').Server(app);
var io = require('socket.io')(server);

var csrfProtection = csurf({ cookie: true });
var parseForm = bodyParser.urlencoded({ extended: false });


require('console-stamp')(console, '[HH:MM:ss]');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.engine('html', require('ejs').renderFile);

app.use(cookieParser());
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', csrfProtection, function(req, res) {
  res.setHeader('X-Frame-Options', 'ALLOW-FROM ' + process.env.framing_domain);
  res.setHeader('Content-Security-Policy', "frame-ancestors http://" + process.env.framing_domain);

  res.render('index.html', { csrfToken: req.csrfToken() });
});

var state = 'closed';
app.get('/api/clickbutton', function (req, res) {
  state = state === 'closed' ? 'open' : 'closed';

  const { spawn } = require('child_process');
  const trusonafy = spawn(process.env.trusona, [ process.env.trusona_user ]);

  trusonafy.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });

  trusonafy.stderr.on('data', (data) => {
    console.log(`stderr: ${data}`);
  });

  trusonafy.on('close', (code) => {
    if(code === 0) {
      // hardcode to closed for now until reed switch
      state = 'closed';

      res.setHeader('X-Frame-Options', 'ALLOW-FROM ' + process.env.framing_domain);
      res.setHeader('Content-Security-Policy', "frame-ancestors http://" + process.env.framing_domain);
      res.setHeader('Content-Type', 'application/json');
      res.end(state);
      outputSequence(7, '10', 1500);
    }
  });
});

app.get('/api/status', function (req, res) {
  res.setHeader('X-Frame-Options', 'ALLOW-FROM ' + process.env.framing_domain);
  res.setHeader('Content-Security-Policy', "frame-ancestors http://" + process.env.framing_domain);
  res.setHeader('Content-Type', 'application/json');

  res.end(JSON.stringify({state: state}));
  console.log('returning state: ' + state);
});

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

function takeSnaps() {
    return setTimeout(function () {
        var imgPath = path.join(__dirname, 'public/images');
        var cmd = 'raspistill -vf -hf -w 640 -h 480 -ex auto -q 100 -e png -sh 100 -o ' + imgPath + '/garage.png';
        var exec = require('child_process').exec;
        exec(cmd, function (error, stdout, stderr) {
            if (error !== null) {
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
    console.log('a user connected');
    startTakingSnaps = true;
    takeSnaps();

    socket.on('disconnect', function () {
        console.log('user disconnected');
        startTakingSnaps = false;
    });
});

var port = process.env.PORT || 8000;
server.listen(port, function () {
    console.log('GaragePi listening on port:', port);
});
