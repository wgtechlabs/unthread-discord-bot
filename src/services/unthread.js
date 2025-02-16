// language: JavaScript
const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

// Initialize Sequelize using SQLite (adjust storage as needed)
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite'
});

// Define the Customer model with Discord ID as the primary key
const Customer = sequelize.define('Customer', {
    discordId: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
    },
    discordUsername: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    discordName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    customerId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
}, {
    tableName: 'customers',
    timestamps: true,
});

// Sync the model with the database
sequelize.sync();

// Function to call the unthread.io API to create a customer
async function createCustomerInUnthread(user) {
    const response = await fetch('https://api.unthread.io/api/customers', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': process.env.UNTHREAD_API_KEY,
        },
        // using the Discord username as the customer name
        body: JSON.stringify({ name: user.username }),
    });

    if (!response.ok) {
        throw new Error(`Failed to create customer: ${response.status}`);
    }

    const data = await response.json(); // expecting a response with customerId
    // Use data.customerId if available, otherwise try data.id
    const customerId = data.customerId || data.id;
    if (!customerId) {
        throw new Error(`Customer API response invalid, missing customerId: ${JSON.stringify(data)}`);
    }
    return customerId;
}

// Save the customer details locally using Sequelize
async function saveCustomer(user) {
    // Check if the customer already exists
    const existing = await Customer.findByPk(user.id);
    if (existing) {
        return existing;
    }

    // Create customer via unthread.io API
    const customerId = await createCustomerInUnthread(user);

    // Save the customer with Discord ID, Username, Name (tag) and customerId
    return await Customer.create({
        discordId: user.id,
        discordUsername: user.username,
        discordName: user.tag,
        customerId,
    });
}

// Function to create a ticket via unthread.io API using the customerId
async function createTicket(user, issue, email) {
  // Ensure the user has a customer record (creates one if needed)
  const customer = await saveCustomer(user);

  const response = await fetch('https://api.unthread.io/api/conversations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': process.env.UNTHREAD_API_KEY,
    },
    body: JSON.stringify({
      type: 'email',
      title: 'Discord Ticket',
      markdown: `Support ticket submitted: ${issue}`,
      status: 'open',
      triageChannelId: process.env.UNTHREAD_TRIAGE_CHANNEL_ID,
      emailInboxId: process.env.UNTHREAD_EMAIL_INBOX_ID,
      customerId: customer.customerId,
      onBehalfOf: {
        name: user.tag,
        email: email,
        id: customer.customerId,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create ticket: ${response.status}`);
  }

  const data = await response.json();
  return data;
}

module.exports = {
    saveCustomer,
    Customer,
    sequelize,
    createTicket,
};