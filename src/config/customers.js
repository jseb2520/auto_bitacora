/**
 * @fileoverview Customer configuration data
 * @module config/customers
 */

/**
 * Customer data with wallet addresses, Revolut details, and Telegram IDs
 * @type {Array<Object>}
 */
const customers = [
  {
    id: 'customer1',
    name: 'John Doe',
    email: 'john.doe@example.com',
    walletAddresses: [
      '0x555e179d64335945Fc6B155B7235a31B0a595542', // ETH address
    ],
    revolutAccount: {
      accountId: 'rev123456',
      email: 'john.doe@example.com',
      phone: '+1234567890'
    },
    telegramId: '1674607484',
    commissionRate: 0.017 // 1.7%
  },
  {
    id: 'customer2',
    name: 'Jane Smith',
    email: 'jane.smith@example.com',
    walletAddresses: [
      '0x555e179d64335945Fc6B155B7235a31B0a595542', // ETH address
    ],
    revolutAccount: {
      accountId: 'rev654321',
      email: 'jane.smith@example.com',
      phone: '+0987654321'
    },
    telegramId: '1674607484',
    commissionRate: 0.017 // 1.7%
  }
  // Add more customers as needed
];

/**
 * Get customer by wallet address
 * @param {string} walletAddress - The wallet address to look up
 * @returns {Object|null} - Customer object or null if not found
 */
const getCustomerByWalletAddress = (walletAddress) => {
  return customers.find(customer => 
    customer.walletAddresses.some(address => 
      address.toLowerCase() === walletAddress.toLowerCase()
    )
  ) || null;
};

/**
 * Get customer by Revolut account details
 * @param {Object} details - Revolut account details to match
 * @param {string} [details.accountId] - Revolut account ID
 * @param {string} [details.email] - Email associated with Revolut account
 * @param {string} [details.phone] - Phone associated with Revolut account
 * @returns {Object|null} - Customer object or null if not found
 */
const getCustomerByRevolutDetails = (details) => {
  return customers.find(customer => {
    if (details.accountId && customer.revolutAccount.accountId === details.accountId) {
      return true;
    }
    if (details.email && customer.revolutAccount.email === details.email) {
      return true;
    }
    if (details.phone && customer.revolutAccount.phone === details.phone) {
      return true;
    }
    return false;
  }) || null;
};

/**
 * Get customer by ID
 * @param {string} id - Customer ID
 * @returns {Object|null} - Customer object or null if not found
 */
const getCustomerById = (id) => {
  return customers.find(customer => customer.id === id) || null;
};

/**
 * Get all customers
 * @returns {Array<Object>} - Array of all customer objects
 */
const getAllCustomers = () => {
  return [...customers];
};

module.exports = {
  customers,
  getCustomerByWalletAddress,
  getCustomerByRevolutDetails,
  getCustomerById,
  getAllCustomers
}; 