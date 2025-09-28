/**
 * Welcome to your Telegram Bot Worker!
 *
 * This worker script is designed to create a Telegram bot that:
 * 1. Responds only to messages in group chats.
 * 2. Takes the message text as a search query.
 * 3. Searches an external API for files matching the query.
 * 4. Responds with the number of results and a link to view them, or a message if no results are found.
 * 5. Includes a '/setwebhook' endpoint for easy setup.
 *
 * Environment Variables:
 * - BOT_TOKEN: Your secret token from BotFather.
 * - WORKER_URL: The URL of this worker (e.g., https://your-worker-name.your-account.workers.dev).
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const botToken = env.BOT_TOKEN;

    if (!botToken) {
      return new Response('BOT_TOKEN secret is not set', { status: 500 });
    }

    // Route for setting up the webhook
    if (path === '/setwebhook') {
      return await setWebhook(url, botToken, env);
    }

    // Main route for handling Telegram updates
    if (request.method === 'POST') {
      try {
        const update = await request.json();
        return await handleUpdate(update, botToken);
      } catch (e) {
        console.error('Error parsing update:', e.message);
        return new Response('Invalid request body', { status: 400 });
      }
    }

    return new Response('Hello! This is the Telegram bot worker. Use the /setwebhook endpoint to configure the bot.');
  },
};

/**
 * Handles incoming updates from Telegram.
 * @param {object} update - The update object from Telegram's Webhook.
 * @param {string} botToken - The bot's API token.
 */
async function handleUpdate(update, botToken) {
  // We only care about messages, and specifically messages with text
  if (!update.message || !update.message.text) {
    return new Response('OK'); // Acknowledge other update types without action
  }

  const message = update.message;
  const chatId = message.chat.id;
  const chatType = message.chat.type;
  const query = message.text.trim();

  // The bot should only work in groups
  if (chatType !== 'group' && chatType !== 'supergroup') {
    // Optionally, send a message back to the user in a private chat
    if (chatType === 'private') {
      await sendMessage(botToken, chatId, 'I only work in group chats.');
    }
    return new Response('OK');
  }
  
  // Ignore commands or empty messages
  if (query.startsWith('/') || query === '') {
     return new Response('OK');
  }

  try {
    // 1. Search for files using the external API
    const searchUrl = `https://tga-hd.api.hashhackers.com/files/search?q=${encodeURIComponent(query)}`;
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
        throw new Error(`API search failed with status: ${searchResponse.status}`);
    }
    const searchData = await searchResponse.json();

    // 2. Respond based on search results
    if (searchData && searchData.files && searchData.files.length > 0) {
      // Results found
      const resultCount = searchData.total_files;
      const responseText = `Found ${resultCount} result(s) for "${query}".`;
      
      const buttonUrl = `https://gods-eye.pages.dev/?q=${encodeURIComponent(query)}&t=files`;
      const replyMarkup = {
        inline_keyboard: [
          [{ text: '🔗 Get Results', url: buttonUrl }],
        ],
      };

      await sendMessage(botToken, chatId, responseText, replyMarkup, message.message_id);

    } else {
      // No results found
      const responseText = `No results found for "${query}". Please try a different search term.`;
      await sendMessage(botToken, chatId, responseText, null, message.message_id);
    }

  } catch (error) {
    console.error('Error during search or send:', error);
    // Inform the user about the error
    await sendMessage(botToken, chatId, 'Sorry, something went wrong while searching.');
  }

  return new Response('OK');
}

/**
 * Sends a message to a specific chat via the Telegram Bot API.
 * @param {string} token - The bot's API token.
 * @param {number} chatId - The ID of the chat to send the message to.
 * @param {string} text - The message text.
 * @param {object|null} replyMarkup - Optional: An object for inline keyboards.
 * @param {number|null} replyToMessageId - Optional: The ID of the message to reply to.
 */
async function sendMessage(token, chatId, text, replyMarkup = null, replyToMessageId = null) {
  const apiUrl = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
  };

  if (replyMarkup) {
    payload.reply_markup = JSON.stringify(replyMarkup);
  }
  
  if (replyToMessageId) {
    payload.reply_to_message_id = replyToMessageId;
  }

  await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Sets the webhook for the Telegram bot to point to this worker.
 * @param {URL} requestUrl - The URL of the incoming request to the worker.
 * @param {string} botToken - The bot's API token.
 * @param {object} env - The worker's environment variables.
 */
async function setWebhook(requestUrl, botToken, env) {
  const workerUrl = env.WORKER_URL;
  if (!workerUrl) {
    return new Response('WORKER_URL secret is not set', { status: 500 });
  }

  const webhookUrl = `${workerUrl}`; // The root of the worker will handle updates
  
  // This command both sets the webhook and clears any outstanding updates.
  const setWebhookApiUrl = `https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}&drop_pending_updates=true`;
  
  const response = await fetch(setWebhookApiUrl);
  const result = await response.json();

  if (result.ok) {
    return new Response(`Webhook set successfully to ${webhookUrl}\n<pre>${JSON.stringify(result, null, 2)}</pre>`, {
        headers: { 'Content-Type': 'text/html' }
    });
  } else {
    return new Response(`Failed to set webhook.\n<pre>${JSON.stringify(result, null, 2)}</pre>`, { 
        status: 500,
        headers: { 'Content-Type': 'text/html' }
    });
  }
}

