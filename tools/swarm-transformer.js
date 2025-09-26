/**
 * Swarm Transformer - Routes through Claude Code instance
 * Transforms requests to work with our local Claude router
 */

module.exports = {
  /**
   * Transform request to Swarm (Claude Code) format
   */
  swarmRequest: async (request) => {
    console.log('[SWARM] Routing through Claude Code instance...');

    // Transform to our router format
    const transformedRequest = {
      url: 'http://localhost:9999/route',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Provider': 'swarm-claude-code'
      },
      body: {
        prompt: request.body.messages?.[request.body.messages.length - 1]?.content || '',
        model: request.body.model,
        messages: request.body.messages,
        system: request.body.system,
        temperature: request.body.temperature,
        max_tokens: request.body.max_tokens,
        tools: request.body.tools,
        stream: request.body.stream
      }
    };

    console.log(`[SWARM] Using model: ${request.body.model}`);

    return transformedRequest;
  },

  /**
   * Transform response from Swarm format back to Claude format
   */
  swarmResponse: async (response, request) => {
    console.log('[SWARM] Processing Claude Code response...');

    // Handle our router response format
    if (response.body.response) {
      // Simple text response from router
      return {
        ...response,
        body: {
          id: `swarm-${Date.now()}`,
          type: 'message',
          role: 'assistant',
          model: response.body.model || request.body.model,
          content: [
            {
              type: 'text',
              text: response.body.response
            }
          ],
          usage: response.body.stats || {
            input_tokens: 0,
            output_tokens: 0
          }
        }
      };
    }

    // Pass through if already in correct format
    return response;
  }
};