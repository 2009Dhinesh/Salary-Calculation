const axios = require('axios');

const sendEmail = async (options) => {
  // Try to get BREVO_API_KEY or fallback to SMTP_PASSWORD
  const apiKey = process.env.BREVO_API_KEY || process.env.SMTP_PASSWORD;

  if (!apiKey || apiKey === 'your_smtp_password') {
    throw new Error('Brevo API Key is not configured. Please set BREVO_API_KEY or SMTP_PASSWORD on Render.');
  }

  console.log(`📧 Sending email to: ${options.email} via Brevo API`);
  console.log(`🔑 Using API Key starting with: ${apiKey.substring(0, 10)}...`);

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
        'api-key': apiKey.trim(), // Ensure no leading/trailing spaces
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
