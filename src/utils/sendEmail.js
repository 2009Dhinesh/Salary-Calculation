const axios = require('axios');

const sendEmail = async (options) => {
  // Check if API Key (SMTP Password) is configured
  if (!process.env.SMTP_PASSWORD || process.env.SMTP_PASSWORD === 'your_smtp_password') {
    throw new Error('Brevo API Key (SMTP_PASSWORD) is not configured in .env');
  }

  console.log(`📧 Sending email to: ${options.email} via Brevo API`);

  try {
    const data = {
      sender: { 
        name: process.env.FROM_NAME || 'Money Tracker', 
        email: process.env.FROM_EMAIL 
      },
      to: [{ email: options.email }],
      subject: options.subject,
      textContent: options.message,
      htmlContent: options.html,
    };

    const config = {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': process.env.SMTP_PASSWORD, // Brevo v3 API Key is the same as SMTP Password
      },
    };

    const response = await axios.post('https://api.brevo.com/v3/smtp/email', data, config);
    
    console.log('✅ Email sent via API! Message ID:', response.data.messageId);
    return response.data;
  } catch (error) {
    console.error('❌ Brevo API Error:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data));
    } else {
      console.error('Message:', error.message);
    }
    throw error;
  }
};

module.exports = sendEmail;
