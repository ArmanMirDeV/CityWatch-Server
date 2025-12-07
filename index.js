const express = require("express");
const app = express();
require("dotenv").config();

const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@kajwala.9fiaw1u.mongodb.net/?appName=kajwala`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const usersCollection = client.db("cityWatch").collection("users");
    const issuesCollection = client.db("cityWatch").collection("issues");
    const staffCollection = client.db("cityWatch").collection("staffs");

    // Users APIs

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const cursor = usersCollection.find().sort({ createdAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    app.put("/users/:email", async (req, res) => {
      const email = req.params.email;
      const updatedInfo = req.body;

      const query = { email };
      const updateDoc = {
        $set: {
          ...updatedInfo,
          updatedAt: new Date(),
        },
      };

      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.patch("/users/block/:email", async (req, res) => {
      const email = req.params.email;
      const { isBlocked } = req.body; // true or false

      const query = { email };
      const updateDoc = {
        $set: { isBlocked },
      };

      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.patch("/users/premium/:email", async (req, res) => {
      const email = req.params.email;

      const query = { email };
      const updateDoc = {
        $set: {
          isPremium: true,
          premiumAt: new Date(),
        },
      };

      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.delete("/users/:email", async (req, res) => {
      const email = req.params.email;

      const query = { email };
      const result = await usersCollection.deleteOne(query);

      res.send(result);
    });

    // Payment API
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "bdt", // or usd
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", async (req, res) => {
        const payment = req.body;
        // Optionally save payment info to a paymentsCollection
        // For now, we just update the user status as requested by the flow
        // But the client calls PATCH /users/premium separately? 
        // Better to handle it here if we want to be atomic, but let's stick to the flexible approach for now or just log it.
        // The user requirement says "After successful payment the user becomes a premium user".
        // It's safer to trust the server.
        // Let's assume the client will handle the database update trigger effectively for this prototype, 
        // OR we can save the payment and return success.
        
        // Let's just create a payments collection for record keeping
        const paymentsCollection = client.db("cityWatch").collection("payments");
        const result = await paymentsCollection.insertOne(payment);
        
        // We can also trigger the upgrade here, but the client might want to do it cleanly. 
        // Let's stick to saving the record here.
        res.send(result);
    });

    // Issues APIs

    app.post("/issues", async (req, res) => {
      const issue = req.body;
      const userEmail = issue.userEmail;

      // Check if user exists and is blocked
      const user = await usersCollection.findOne({ email: userEmail });

      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }

      if (user.isBlocked) {
        return res.status(403).send({ message: "You are blocked from posting issues." });
      }

      // Check limit for free users
      if (!user.isPremium) {
        const issueCount = await issuesCollection.countDocuments({ userEmail: userEmail });
        if (issueCount >= 3) {
           return res.status(403).send({ message: "Free users can only post 3 issues. Please upgrade to Premium." });
        }
      }

      const newIssue = {
        ...issue,
        status: "pending",
        priority: "normal",
        createdAt: new Date(),
        updatedAt: new Date(),
        upvotes: [],
        assignedStaff: null,
        timeline: [
          {
            status: "pending",
            message: "Issue created by citizen",
            updatedBy: userEmail,
            date: new Date(),
          },
        ],
      };

      const result = await issuesCollection.insertOne(newIssue);
      res.send(result);
    });
    
    app.get("/citizen/stats/:email", async (req, res) => {
        const email = req.params.email;
        const query = { userEmail: email };
        
        const issues = await issuesCollection.find(query).toArray();
        
        const stats = {
            total: issues.length,
            pending: issues.filter(i => i.status === 'pending').length,
            inProgress: issues.filter(i => i.status === 'in-progress').length,
            resolved: issues.filter(i => i.status === 'resolved').length,
            closed: issues.filter(i => i.status === 'closed').length,
            issuesList: issues // Return full list for My Issues page
        };
        
        res.send(stats);
    });

    app.get("/issues", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const { search, status, priority, category } = req.query;

      const query = {};

      if (status) query.status = status;
      if (priority) query.priority = priority;
      if (category) query.category = category;

      if (search) {
        query.$or = [
          { title: { $regex: search, $options: "i" } },
          { category: { $regex: search, $options: "i" } },
          { location: { $regex: search, $options: "i" } },
        ];
      }

      const totalIssues = await issuesCollection.countDocuments(query);
      
      const cursor = issuesCollection
        .find(query)
        .sort({ priority: -1, createdAt: -1 }) // Boosted (high priority) first, then newest
        .skip(skip)
        .limit(limit);

      const result = await cursor.toArray();
      res.send({ issues: result, totalCount: totalIssues });
    });

    app.get("/issues/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const issue = await issuesCollection.aggregate([
        { $match: query },
        {
          $lookup: {
            from: "staffs",
            localField: "assignedStaff",
            foreignField: "email",
            as: "staffDetails"
          }
        },
        {
          $unwind: {
            path: "$staffDetails",
            preserveNullAndEmptyArrays: true
          }
        }
      ]).next();

      res.send(issue);
    });

    app.put("/issues/:id", async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;

      const query = { _id: new ObjectId(id) };
      const issue = await issuesCollection.findOne(query);

      if (!issue) return res.status(404).send({ message: "Issue not found" });
      if (issue.status !== "pending")
        return res
          .status(400)
          .send({ message: "Only pending issues can be edited" });

      const updatedIssue = {
        $set: {
          title: updateData.title,
          description: updateData.description,
          category: updateData.category,
          location: updateData.location,
          image: updateData.image,
          updatedAt: new Date(),
        },
        $push: {
          timeline: {
            status: issue.status,
            message: "Issue was edited",
            updatedBy: updateData.userEmail,
            date: new Date(),
          },
        },
      };

      const result = await issuesCollection.updateOne(query, updatedIssue);
      res.send(result);
    });

    app.delete("/issues/:id", async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };
      const result = await issuesCollection.deleteOne(query);
      res.send(result);
    });

    app.patch("/issues/upvote/:id", async (req, res) => {
      const id = req.params.id;
      const userEmail = req.body.userEmail;

      const query = { _id: new ObjectId(id) };
      const issue = await issuesCollection.findOne(query);

      if (!issue) return res.status(404).send({ message: "Issue not found" });

      if (issue.userEmail === userEmail)
        return res
          .status(400)
          .send({ message: "You cannot upvote your own issue" });

      if (issue.upvotes.includes(userEmail))
        return res.status(400).send({ message: "Already upvoted" });

      const result = await issuesCollection.updateOne(query, {
        $push: { upvotes: userEmail },
        $set: { updatedAt: new Date() },
      });

      res.send(result);
    });

    app.patch("/issues/boost/:id", async (req, res) => {
      const id = req.params.id;
      const userEmail = req.body.userEmail;

      const query = { _id: new ObjectId(id) };
      const issue = await issuesCollection.findOne(query);

      if (!issue) return res.status(404).send({ message: "Issue not found" });

      if (issue.priority === "high")
        return res.status(400).send({ message: "Already boosted" });

      const result = await issuesCollection.updateOne(query, {
        $set: { priority: "high", updatedAt: new Date() },
        $push: {
          timeline: {
            status: issue.status,
            message: "Issue priority boosted by citizen",
            updatedBy: userEmail,
            date: new Date(),
          },
        },
      });

      res.send(result);
    });

    app.patch("/issues/assign/:id", async (req, res) => {
      const id = req.params.id;
      const staffEmail = req.body.staffEmail;
      const adminEmail = req.body.adminEmail;

      const query = { _id: new ObjectId(id) };
      const issue = await issuesCollection.findOne(query);

      if (issue.assignedStaff)
        return res.status(400).send({ message: "Staff already assigned" });

      const result = await issuesCollection.updateOne(query, {
        $set: { assignedStaff: staffEmail, updatedAt: new Date() },
        $push: {
          timeline: {
            status: issue.status,
            message: `Issue assigned to staff: ${staffEmail}`,
            updatedBy: adminEmail,
            date: new Date(),
          },
        },
      });

      res.send(result);
    });

    app.patch("/issues/status/:id", async (req, res) => {
      const id = req.params.id;
      const { newStatus, staffEmail } = req.body;

      const query = { _id: new ObjectId(id) };
      const issue = await issuesCollection.findOne(query);

      const result = await issuesCollection.updateOne(query, {
        $set: { status: newStatus, updatedAt: new Date() },
        $push: {
          timeline: {
            status: newStatus,
            message: `Status updated to ${newStatus}`,
            updatedBy: staffEmail,
            date: new Date(),
          },
        },
      });

      res.send(result);
    });


    
    //  Stuff CRUD APIs

app.post("/staff", async (req, res) => {
  const staff = req.body;

  staff.createdAt = new Date();
  staff.updatedAt = new Date();
  staff.role = "staff";
  staff.assignedIssues = staff.assignedIssues || [];

  const query = { email: staff.email };
  const existingStaff = await staffCollection.findOne(query);

  if (existingStaff) {
    return res.send({ message: "Staff already exists", insertedId: null });
  }

  const result = await staffCollection.insertOne(staff);
  res.send(result);
});

    
    app.get("/staff", async (req, res) => {
      const result = await staffCollection.find().toArray();
      res.send(result);
    });

    app.get("/staff/:id", async (req, res) => {
      const id = req.params.id;
      const result = await staffCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });


    app.patch("/staff/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      updatedData.updatedAt = new Date();

      const result = await staffCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );

      res.send(result);
    });

app.delete("/staff/:id", async (req, res) => {
  const id = req.params.id;
  const result = await staffCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});
    
    
    app.get("/staff/:email/issues", async (req, res) => {
      const email = req.params.email;

      const staff = await staffCollection.findOne({ email });
      if (!staff) return res.status(404).send({ message: "Staff not found" });

      const issueIds = staff.assignedIssues.map((id) => new ObjectId(id));

      const assignedIssues = await issuesCollection
        .find({ _id: { $in: issueIds } })
        .sort({ priority: -1 }) // boosted issues first
        .toArray();

      res.send(assignedIssues);
    });


    app.get("/staff/:email/stats", async (req, res) => {
      const email = req.params.email;

      const staff = await staffCollection.findOne({ email });
      if (!staff) return res.status(404).send({ message: "Staff not found" });

      const issueIds = staff.assignedIssues.map((id) => new ObjectId(id));

      const issues = await issuesCollection
        .find({ _id: { $in: issueIds } })
        .toArray();

      const stats = {
        totalAssigned: issues.length,
        resolved: issues.filter((i) => i.status === "resolved").length,
        closed: issues.filter((i) => i.status === "closed").length,
        todayTasks: issues.filter(
          (i) =>
            new Date(i.updatedAt).toDateString() === new Date().toDateString()
        ).length,
      };

      res.send(stats);
    });


    app.patch("/issues/:id/status", async (req, res) => {
      const id = req.params.id;
      const { newStatus, updatedBy } = req.body;

      const statusTimelineRecord = {
        status: newStatus,
        message: `Status changed to ${newStatus}`,
        updatedBy,
        date: new Date(),
      };

      const result = await issuesCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status: newStatus,
            updatedAt: new Date(),
          },
          $push: { timeline: statusTimelineRecord },
        }
      );

      res.send(result);
    });









    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World! CityWatch is Running.");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
