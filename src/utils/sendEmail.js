const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  // Check if SMTP is configured or if it contains placeholders
  if (!process.env.SMTP_HOST || process.env.SMTP_HOST === 'your_smtp_host') {
    throw new Error('SMTP is not configured. Please set real SMTP values in your .env file.');
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const message = {
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html,
  };

  console.log(`📧 Sending email to: ${options.email} using ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);

  try {
    const info = await transporter.sendMail(message);
    console.log('✅ Message sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Nodemailer Error:');
    console.error('Code:', error.code);
    console.error('Message:', error.message);
    if (error.response) console.error('Response:', error.response);
    throw error;
  }
};

module.exports = sendEmail;
