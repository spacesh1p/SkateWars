const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');

const UserDbItem = require('./UserDbItem');

const DATABASE_URI = process.env.MONGODB_URI || 'mongodb://localhost/SkateWars';
const PORT = process.env.PORT || 3000;


http.listen(PORT, function(){
    console.log('listening on *:3000');
});

app.use(express.urlencoded());

app.post('/register', function (request, response) {
    if (!request.body) return response.sendStatus(400);

    let uname = request.body.uname;
    let passwd = request.body.passwd;

    if ((!uname) || (!passwd)) {
        response.send(JSON.stringify(false));
        return;
    }

    console.log('Username: ' + uname + ', password: ' + passwd);

    // let newUser = new UserDbItem({
    //     username: uname,
    //     password: passwd
    // });
    //
    // mongoose.connect(DATABASE_URI, function (err) {
    //     if (err) {
    //         response.send(JSON.stringify(false));
    //         return;
    //     }
    //
    //     newUser.pre('save', function (next) {
    //         const self = this;
    //         UserDbItem.find({username: self.username}, function (err, users) {
    //             if (!users.length) {
    //                 response.send(JSON.stringify(true));
    //                 next();
    //             } else {
    //                 response.send(JSON.stringify(false));
    //                 next(new Error('User exists!'));
    //             }
    //
    //         });
    //     });
    // });
    
});

class User {
    constructor(username) {
        this.username = username;

    }

    getUsername() {
        return this.username;
    }

}

class Challenge {
    constructor(user1, user2, socket1, socket2) {
        this.user1 = user1;
        this.user2 = user2;
        this.socket1 = socket1;
        this.socket2 = socket2;

        this.score = {user1: 0, user2: 0};
        this.toss1 = -1;
        this.toss2 = -1;

        this.turn = null;
    }

    sendResponse(isAccepted) {
        console.log("send response " + isAccepted);
        this.socket1.emit('challenge response', JSON.stringify(isAccepted), JSON.stringify(this.user2));
        this.socket2.emit('challenge response', JSON.stringify(isAccepted), JSON.stringify(this.user1));
    }

    getOpponentSocket(user) {
        if (this.user1 === user) {
            return this.socket2;
        }
        else if (this.user2 === user) {
            return this.socket1;
        }
    }

    getUserSocket(user) {
        if (this.user1 === user)
            return this.socket1;
        else if (this.user2 === user)
            return this.socket2;
    }

    sendUserLeft(user) {
        this.getOpponentSocket(user).emit('opp left');
    }

    sendMessage(user, msg) {
        this.getOpponentSocket(user).emit('new message', JSON.stringify(msg));
    }

    sendTyping(user) {
        this.getOpponentSocket(user).emit('typing', JSON.stringify(user));

    }

    sendStopTyping(user) {
        this.getOpponentSocket(user).emit('stop typing', JSON.stringify(user));
    }

    makeToss(user, toss) {
        console.log("Toss " + this.toss1 + " " + this.toss2);
        if (user === this.user1)
            this.toss1 = toss;
        if (user === this.user2)
            this.toss2 = toss;

        if (this.toss1 !== -1 && this.toss2 !== -1) {
            //let rand = Math.floor(Math.random() * 9) ;
            let rand = 5;
            let res = Math.abs(this.toss1 - rand) < Math.abs(this.toss2 - rand);

            this.socket1.emit('turn', JSON.stringify(res));
            this.socket2.emit('turn', JSON.stringify(!res));

            if (res) {
                this.turn = this.user1;
            } else {
                this.turn = this.user2;
            }
        }
    }

    sendVideo(user, video) {
        console.log("DDAGAEV: send video");
        this.getOpponentSocket(user).emit('video', video);
    }

    processTrickResponse(user, isAccepted) {
        this.socket1.emit('trick response', JSON.stringify(isAccepted));
        this.socket2.emit('trick response', JSON.stringify(isAccepted));
        if (!isAccepted) {
            if (this.turn === user) {
                if (this.user1 === user)
                    this.score.user2++;
                else if (this.user2 === user)
                    this.score.user1++;

                this.socket1.emit('score', JSON.stringify(this.score.user1), JSON.stringify(this.score.user2));
                this.socket2.emit('score', JSON.stringify(this.score.user2), JSON.stringify(this.score.user1));

            } else {
                this.turn = user;
            }
        } else if (this.turn !== user) {
            this.getUserSocket(user).emit('reply');
            return;
        }

        let res = this.turn === user;

        this.getUserSocket(user).emit('turn', JSON.stringify(res));
        this.getOpponentSocket(user).emit('turn', JSON.stringify(!res));
    };
}

challengeId = 0;
challengesMap = new Map;
usersOnline = new Map;
socketInChallenge = new Map;

// io.use(function(socket, next){
//
//     let login = socket.handshake.query['login'];
//     let password = socket.handshake.query['passwd'];
//
//     if ((!login) || (!password)) {
//         next(new Error('Authentication error'));
//     }
//
//     console.log('Login: ' + login + ', password: ' + password);
//     next();
//
//     mongoose.connect(DATABASE_URI, function (err) {
//         let login = socket.handshake.query['login'];
//         let password = socket.handshake.query['passwd'];
//
//         if ((!login) || (!password)) {
//             next(new Error('Authentication error'));
//         }
//
//         const user = new UserDbItem({
//             username: login,
//             password: password
//         });
//
//         UserDbItem.find({username: user.username, password: user.password}, function (err, users) {
//            if (users.length === 1) {
//                next();
//            } else {
//                next(new Error('Authentication error'));
//            }
//         });
//     });
// });

io.on('connection', function(socket){
    console.log('an user ' + socket.handshake.query['login'] + ' connected, password=' + socket.handshake.query['passwd']);
    let newUser = new User(socket.handshake.query['login']);

    usersOnline.forEach((value, key) => {
       key.emit('user joined', JSON.stringify(newUser));
    });

    usersOnline.set(socket, newUser);
    socketInChallenge.set(socket, -1);

    socket.on('disconnect', function () {
        let user = usersOnline.get(socket);
        console.log('an user ' + user.getUsername() + ' disconnected');
        usersOnline.delete(socket);
        usersOnline.forEach((value, key) => {
           key.emit('user left', JSON.stringify(user)); 
        });

        let id = socketInChallenge.get(socket);
        if (id !== -1) {
            let challenge = challengesMap.get(id);
            if (challenge !== undefined) {
                challengesMap.get(id).sendUserLeft(user);
                challengesMap.delete(id);
            }
            socketInChallenge.set(socket, -1);
        }

    });

    socket.on('get users', function () {
        let users = [];
        usersOnline.forEach((value, key) => {
            // if (key !== socket)
                users.push(value);
        });
        console.log(JSON.stringify(users));
        socket.emit('get users', JSON.stringify(users));
    });
    
    socket.on('challenge', function (username) {
        usersOnline.forEach((value, key) => {
            if (value.getUsername() === username) {
                key.emit('challenge', JSON.stringify(usersOnline.get(socket)), challengeId);
                let newChallenge = new Challenge(usersOnline.get(socket), value, socket, key);
                challengesMap.set(challengeId, newChallenge);
                socketInChallenge.set(socket, challengeId);
                socketInChallenge.set(key, challengeId);
                challengeId++;
                return;
            }
        });
    });

    socket.on('challenge response', function (isAccepted) {
        let id = socketInChallenge.get(socket);
        console.log("LOG: id=" + id + " isAccepted=" + isAccepted);
        if (id !== -1) {
            challengesMap.get(id).sendResponse(isAccepted);
            if (!isAccepted) {
                challengesMap.delete(id);
                socketInChallenge.set(socket, -1);
            }
        }
    });

    socket.on('new message', function (msg) {
        let user = usersOnline.get(socket);
        let id = socketInChallenge.get(socket);
        if (id !== -1) {
            challengesMap.get(id).sendMessage(user, msg);
        }
    });

    socket.on('typing', function () {
        let user = usersOnline.get(socket);
        let id = socketInChallenge.get(socket);
        if (id !== -1) {
            challengesMap.get(id).sendTyping(user);
        }
    });

    socket.on('stop typing', function() {
        let user = usersOnline.get(socket);
        let id = socketInChallenge.get(socket);
        if (id !== -1) {
            challengesMap.get(id).sendStopTyping(user);
        }
    });

    socket.on("toss", function (num) {
        let user = usersOnline.get(socket);
        let id = socketInChallenge.get(socket);
        if (id !== -1) {
            challengesMap.get(id).makeToss(user, num);
        }
    });

    socket.on('video', function (video) {
        let user = usersOnline.get(socket);
        console.log("video " + user.getUsername());
        let id = socketInChallenge.get(socket);
        if (id !== -1) {
            challengesMap.get(id).sendVideo(user, video);
        }

    });

    socket.on('trick response', function (isAccepted) {
        let user = usersOnline.get(socket);
        let id = socketInChallenge.get(socket);
        if (id !== -1) {
            challengesMap.get(id).processTrickResponse(user, isAccepted);
        }
    });

    socket.on('game end', function () {
        let id = socketInChallenge.get(socket);
        if (id !== -1) {
            let challenge = challengesMap.get(id);
            if (challenge !== undefined) {
                challengesMap.delete(id);
            }
            socketInChallenge.set(socket, -1);
        }
    });

    socket.on('error', function (error) {
        if (error.description) console.log("Get error: " + error.description);
        else console.log("Get error: " + errors);
    });
});
