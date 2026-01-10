// MongoDB Atlas connection configuration
// Copy this file to ../private/mongodb.js and update with your credentials

module.exports = {
    // MongoDB Atlas connection URI
    // Format: mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority
    //
    // To get this URI:
    // 1. Log in to MongoDB Atlas (https://cloud.mongodb.com)
    // 2. Click "Connect" on your cluster
    // 3. Choose "Connect your application"
    // 4. Copy the connection string and replace <password> with your database user password
    uri: "mongodb+srv://<username>:<password>@<cluster>.mongodb.net/digitalarcana?retryWrites=true&w=majority"
};
