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

  const info = await transporter.sendMail(message);

  console.log('Message sent: %s', info.messageId);
};

module.exports = sendEmail;
