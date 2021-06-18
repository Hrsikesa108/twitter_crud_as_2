const express = require("express");
const app = express();
app.use(express.json());

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const format = require("date-fns/format");
const { isValid } = require("date-fns");

let db = null;
//initializeDb
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server running at http://localhost:3000")
    );
  } catch (e) {
    console.log(`Db Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const validatePassword = (password) => {
  return password.length >= 6;
};

// API 1 register user
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    const createUserQuery = ` INSERT INTO user (name, username, password, gender)
        VALUES 
        ('${name}', '${username}', '${hashedPassword}', '${gender}');`;
    if (validatePassword(password)) {
      await db.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//login API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid User");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "aravind");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid Password");
    }
  }
});

//authenticate with JWT token
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (authHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "aravind", async (error, payload) => {
      if (error) {
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//Returns the latest tweets of people whom the user follows. Return 4 tweets at a time
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const getFollowingUserQuery = `SELECT following_user_id 
    FROM user JOIN follower ON user.user_id = follower.follower_user_id
    WHERE user.username LIKE '${request.username}'; `;
  const followingUserData = await db.all(getFollowingUserQuery);
  const followingIds = followingUserData.map(
    (eachId) => eachId.following_user_id
  );

  const followingUserTweets = `SELECT user.username, tweet.tweet, tweet.date_time AS dateTime
    FROM user JOIN tweet ON user.user_id = tweet.user_id WHERE user.user_id 
    IN (${followingIds.join(",")}) LIMIT 4;`;
  const tweetList = await db.all(followingUserTweets);
  response.send(tweetList);
});

//Returns the list of all names of people whom the user follows
app.get("/user/following/", authenticateToken, async (request, response) => {
  const getFollowingUidQuery = `SELECT *
        FROM user join follower ON user.user_id=follower.follower_user_id 
        WHERE user.username LIKE "${request.username}" ;`;

  const followingUidData = await db.all(getFollowingUidQuery);

  let followingIds = followingUidData.map(
    (eachItem) => eachItem.following_user_id
  );

  const followingUserNames = `SELECT user.username FROM user WHERE user_id 
        IN (${followingIds.join(",")});`;

  const followerNamesData = await db.all(followingUserNames);

  response.send(followerNamesData);
});

//Returns the list of all names of people who follows the user
//API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const getFollowerUidQuery = `SELECT *
        FROM user join follower ON user.user_id=follower.following_user_id 
        WHERE user.username LIKE "${request.username}" ;`;

  const followerUidData = await db.all(getFollowerUidQuery);

  let followerIds = followerUidData.map(
    (eachItem) => eachItem.follower_user_id
  );

  const followingNamesData = `SELECT user.username
   FROM user WHERE user_id IN (${followerIds.join(",")});`;
  const followerNamesData = await db.all(followingNamesData);
  response.send(followerNamesData);
});

//API 6 If the user requests a tweet of the user he is following, return the tweet, likes count, replies count and date-time
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  let { tweetId } = request.params;
  const getFollowingUidQuery = `SELECT *
        FROM user join follower ON user.user_id=follower.follower_user_id 
        WHERE user.username LIKE "${request.username}" ;`;

  const followingUidData = await db.all(getFollowingUidQuery);

  let followingIds = followingUidData.map(
    (eachItem) => eachItem.following_user_id
  );

  const tweetUserQuery = `SELECT * FROM tweet WHERE tweet_id=${parseInt(
    tweetId
  )};`;
  const tweetDbResponse = await db.get(tweetUserQuery);

  const isFound = followingIds.find((item) => {
    if (item === tweetDbResponse.user_id) {
      return tweetDbResponse.user_id;
    }
  });

  if (isFound !== undefined) {
    const getTweetQuery = `SELECT tweet_id, tweet.tweet,tweet.date_time AS dateTime
       FROM tweet WHERE tweet.user_id=${isFound};`;
    let tweetsData = await db.get(getTweetQuery);
    tweet_id = tweetsData.tweet_id;
    tweet = tweetsData.tweet;
    // console.log(tweet);
    dateTime = tweetsData.dateTime;
    const likeQuery = `select count(tweet_id) as likes from like where tweet_id = ${tweet_id} group by tweet_id;`;
    const likeDbResponse = await db.get(likeQuery);
    const likes = likeDbResponse.likes;
    // console.log(likes);
    const replyQuery = `select count(tweet_id) as reply from reply where tweet_id = ${tweet_id} group by tweet_id;`;
    const replyDbResponse = await db.get(replyQuery);
    const replies = replyDbResponse.reply;
    // console.log(likes);
    response.send({ tweet, likes, replies, dateTime });
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

// API-7 If the user requests a tweet of a user he is following,
// return the list of usernames who liked the tweet
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getFollowingUidQuery = `SELECT *
        FROM user join follower ON user.user_id=follower.follower_user_id 
        WHERE user.username LIKE "${request.username}" ;`;

    const followingUidData = await db.all(getFollowingUidQuery);

    let followingIds = followingUidData.map(
      (eachItem) => eachItem.following_user_id
    );
    const tweetUserQuery = `SELECT * FROM tweet WHERE tweet_id=${parseInt(
      tweetId
    )};`;
    const tweetDbResponse = await db.get(tweetUserQuery);
    // console.log(tweetDbResponse);
    const isFound = followingIds.find((item) => {
      if (item === tweetDbResponse.user_id) {
        return tweetDbResponse.user_id;
      }
    });

    if (isFound !== undefined) {
      const getTweetQuery = `SELECT tweet_id, tweet.tweet,tweet.date_time AS dateTime
            FROM tweet WHERE tweet.user_id=${isFound};`;
      let tweetsData = await db.get(getTweetQuery);
      tweet_id = tweetsData.tweet_id;

      const userIdQuery = `select user_id from like where tweet_id = ${tweet_id};`;
      const userIdDbResponse = await db.all(userIdQuery);
      const userNames = [];
      for (let item of userIdDbResponse) {
        const userNameLikedQuery = `SELECT name as likes FROM user 
                 WHERE user_id = ${item.user_id} ;`;
        const names = await db.get(userNameLikedQuery);
        userNames.push(names);
      }
      usernameList = [];
      for (let item of userNames) {
        usernameList.push(item.likes);
      }
      const output = { likes: usernameList };
      response.send(output);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API-8 user requests a tweet of a user he is following, return the list of replies.
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getFollowingUidQuery = `SELECT *
        FROM user join follower ON user.user_id=follower.follower_user_id 
        WHERE user.username LIKE "${request.username}" ;`;

    const followingUidData = await db.all(getFollowingUidQuery);

    let followingIds = followingUidData.map(
      (eachItem) => eachItem.following_user_id
    );
    const tweetUserQuery = `SELECT * FROM tweet WHERE tweet_id=${parseInt(
      tweetId
    )};`;
    const tweetDbResponse = await db.get(tweetUserQuery);
    // console.log(tweetDbResponse);
    const isFound = followingIds.find((item) => {
      if (item === tweetDbResponse.user_id) {
        return tweetDbResponse.user_id;
      }
    });

    if (isFound !== undefined) {
      const getTweetQuery = `SELECT tweet_id, tweet.tweet,tweet.date_time AS dateTime
            FROM tweet WHERE tweet.user_id=${isFound};`;
      let tweetsData = await db.get(getTweetQuery);
      tweet_id = tweetsData.tweet_id;
      const repliesQuery = `SELECT user.name AS name, reply.reply as reply FROM
            user JOIN reply on user.user_id = reply.user_id WHERE reply.tweet_id = ${tweet_id};`;
      const replyDbResponse = await db.all(repliesQuery);
      const output = { replies: replyDbResponse };
      response.send(output);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API-9 Returns a list of all tweets of the user
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const tweetsOfUserQuery = `SELECT tweet.tweet AS tweet, tweet.date_time 
    AS dateTime FROM tweet join user ON tweet.user_id = user.user_id 
    WHERE user.username = '${request.username}';`;
  const tweetsDbResponse = await db.all(tweetsOfUserQuery);

  const userIdQuery = `SELECT user_id from user where username = '${request.username}';`;
  const userIdDbResponse = await db.get(userIdQuery);
  //
  const getTweetQuery = `SELECT tweet_id, tweet.tweet,tweet.date_time AS dateTime
       FROM tweet WHERE tweet.user_id=${userIdDbResponse};`;
  let tweetsData = await db.get(getTweetQuery);
  tweet_id = tweetsData.tweet_id;
  tweet = tweetsData.tweet;
  console.log(tweet);
  dateTime = tweetsData.dateTime;
  const likeQuery = `select count(tweet_id) as likes from like where tweet_id = ${tweet_id} group by tweet_id;`;
  const likeDbResponse = await db.get(likeQuery);
  const likes = likeDbResponse.likes;
  console.log(likes);
  const replyQuery = `select count(tweet_id) as reply from reply where tweet_id = ${tweet_id} group by tweet_id;`;
  const replyDbResponse = await db.get(replyQuery);
  const replies = replyDbResponse.reply;

  //   response.send(tweetsDbResponse);
});

//API-10 Create a tweet in the tweet table
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const userIdQuery = `SELECT user_id from user where username = '${request.username}';`;
  const userIdDbResponse = await db.get(userIdQuery);

  const formattedDate = format(new Date(), "yyyy-MM-dd");
  const createTweetQuery = `INSERT INTO tweet (tweet, user_id, date_time)
    VALUES ('${tweet}', ${userIdDbResponse.user_id}, ${formattedDate});`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//API-11 delete a tweet of his tweet
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const userIdQuery = `SELECT user_id from user where username = '${request.username}';`;
    const userIdDbResponse = await db.get(userIdQuery);

    const userNameQuery = `SELECT tweet_id FROM tweet WHERE user_id = ${userIdDbResponse.user_id};`;
    const userNameResponse = await db.all(userNameQuery);
    const userNameList = [];
    for (let item of userNameResponse) {
      userNameList.push(item.tweet_id);
    }

    let outputBoolean = userNameList.includes(parseInt(tweetId));

    if (outputBoolean) {
      const deleteTweetQuery = `
              DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
