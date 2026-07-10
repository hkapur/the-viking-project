// Initialize Firebase using compat libraries (works over file:// protocol)
let app, db;
try {
  app = firebase.initializeApp(window.firebaseConfig);
  db = firebase.firestore();
  console.log("Firebase initialized successfully.");
} catch (error) {
  console.error("Firebase initialization failed.", error);
}

window.submitScore = async function (username, countryCode, score, breakdown) {
  if (!db) {
    console.warn("Cannot submit score: Firebase not configured.");
    return false;
  }

  try {
    const docRef = await db.collection("leaderboard").add({
      username: username,
      country: countryCode,
      score: score,
      breakdown: breakdown,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log("Score submitted with ID: ", docRef.id);
    return true;
  } catch (e) {
    console.error("Error adding document: ", e);
    return false;
  }
}

window.fetchLeaderboard = async function () {
  if (!db) {
    console.warn("Cannot fetch leaderboard: Firebase not configured.");
    return [];
  }

  try {
    const querySnapshot = await db.collection("leaderboard")
      .orderBy("score", "desc")
      .limit(10)
      .get();
    
    const scores = [];
    querySnapshot.forEach((doc) => {
      scores.push(doc.data());
    });
    return scores;
  } catch (e) {
    console.error("Error fetching leaderboard: ", e);
    return [];
  }
}

window.incrementGlobalTries = async function () {
  if (!db) return;
  try {
    const docRef = db.collection("stats").doc("global");
    await docRef.set({
      totalTries: firebase.firestore.FieldValue.increment(1)
    }, { merge: true });
  } catch (e) {
    console.error("Error incrementing global tries: ", e);
  }
}

window.subscribeToGlobalTries = function (callback) {
  if (!db) return () => {};
  try {
    return db.collection("stats").doc("global").onSnapshot((doc) => {
      if (doc.exists) {
        callback(doc.data().totalTries || 0);
      }
    });
  } catch (e) {
    console.error("Error subscribing to global tries: ", e);
    return () => {};
  }
}
