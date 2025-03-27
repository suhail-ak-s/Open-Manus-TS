/**
 * OpenManus POST-based SSE Client
 *
 * This utility creates a streaming connection using POST requests
 * instead of the standard EventSource which only supports GET.
 */
class PostEventSource {
  /**
   * Create a new POST-based event source
   *
   * @param {string} url - The URL to connect to
   * @param {Object} options - Connection options
   */
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
    this.eventListeners = {};
    this.connectionId = null;
    this.connected = false;
    this.reconnectTimeout = options.reconnectTimeout || 3000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
    this.reconnectAttempts = 0;
    this.lastEventId = options.lastEventId || null;
    this.abortController = null;
  }

  /**
   * Add an event listener
   *
   * @param {string} event - Event name
   * @param {Function} callback - Event callback
   */
  addEventListener(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  /**
   * Remove an event listener
   *
   * @param {string} event - Event name
   * @param {Function} callback - Event callback
   */
  removeEventListener(event, callback) {
    if (!this.eventListeners[event]) return;

    const index = this.eventListeners[event].indexOf(callback);
    if (index !== -1) {
      this.eventListeners[event].splice(index, 1);
    }
  }

  /**
   * Dispatch an event to all listeners
   *
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  dispatchEvent(event, data) {
    if (this.eventListeners[event]) {
      const eventObj = { type: event, data };
      this.eventListeners[event].forEach(callback => {
        callback(eventObj);
      });
    }

    // Also dispatch to 'message' event listeners
    if (event !== 'message' && this.eventListeners['message']) {
      const eventObj = { type: 'message', data, originalType: event };
      this.eventListeners['message'].forEach(callback => {
        callback(eventObj);
      });
    }
  }

  /**
   * Connect to the SSE endpoint using a POST request
   */
  connect() {
    if (this.connected) return;

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Prepare request body
    const body = JSON.stringify({
      sessionId: this.options.sessionId || this.generateSessionId(),
      lastEventId: this.lastEventId,
      options: this.options.connectionOptions || {},
    });

    // Dispatch connecting event
    this.dispatchEvent('connecting', null);

    // Make the POST request
    fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body,
      signal,
      credentials: this.options.withCredentials ? 'include' : 'same-origin',
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }

        this.connected = true;
        this.reconnectAttempts = 0;

        // Dispatch open event
        this.dispatchEvent('open', null);

        // Setup reader for streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // Process the stream
        const processStream = ({ done, value }) => {
          if (done) {
            this.connected = false;
            this.reconnect();
            return;
          }

          // Decode the chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });

          // Process events in buffer
          const events = this.parseEvents(buffer);
          buffer = events.buffer;

          // Dispatch the parsed events
          events.events.forEach(event => {
            if (event.id) {
              this.lastEventId = event.id;
            }

            if (event.event && event.data) {
              this.dispatchEvent(event.event, event.data);
            }
          });

          // Continue reading
          reader
            .read()
            .then(processStream)
            .catch(error => {
              this.handleError(error);
            });
        };

        // Start reading
        reader
          .read()
          .then(processStream)
          .catch(error => {
            this.handleError(error);
          });
      })
      .catch(error => {
        // Only process error if not aborted by user
        if (!signal.aborted) {
          this.handleError(error);
        }
      });
  }

  /**
   * Parse SSE events from a text buffer
   *
   * @param {string} buffer - Text buffer containing SSE events
   * @returns {Object} Object containing parsed events and remaining buffer
   */
  parseEvents(buffer) {
    const events = [];
    let currentEvent = {
      event: '',
      data: '',
      id: null,
    };

    // Split buffer into lines
    const lines = buffer.split(/\r\n|\r|\n/);

    // If the buffer doesn't end with two newlines,
    // keep the last part in the buffer for next time
    let remainingBuffer = '';
    if (!buffer.endsWith('\n\n')) {
      remainingBuffer = lines.pop() || '';
    }

    // Process each line
    for (const line of lines) {
      if (line === '') {
        // Empty line indicates the end of an event
        if (currentEvent.data) {
          // Try to parse JSON data
          try {
            currentEvent.data = JSON.parse(currentEvent.data);
          } catch (e) {
            // Keep as string if not valid JSON
          }

          events.push({ ...currentEvent });

          // Reset current event
          currentEvent = {
            event: '',
            data: '',
            id: null,
          };
        }
      } else if (line.startsWith('id:')) {
        currentEvent.id = line.substring(3).trim();
      } else if (line.startsWith('event:')) {
        currentEvent.event = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        currentEvent.data += line.substring(5).trim();
      } else if (line.startsWith(':')) {
        // Comment, ignore
      }
    }

    return { events, buffer: remainingBuffer };
  }

  /**
   * Handle connection error
   *
   * @param {Error} error - The error that occurred
   */
  handleError(error) {
    this.connected = false;

    // Dispatch error event
    this.dispatchEvent('error', error);

    // Attempt to reconnect
    this.reconnect();
  }

  /**
   * Attempt to reconnect
   */
  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.dispatchEvent('maxReconnectAttemptsReached', {
        attempts: this.reconnectAttempts,
      });
      return;
    }

    this.reconnectAttempts++;

    // Dispatch reconnecting event
    this.dispatchEvent('reconnecting', {
      attempt: this.reconnectAttempts,
      delay: this.reconnectTimeout,
    });

    // Attempt to reconnect after timeout
    setTimeout(() => {
      this.connect();
    }, this.reconnectTimeout);
  }

  /**
   * Close the connection
   */
  close() {
    if (this.abortController) {
      this.abortController.abort();
    }

    this.connected = false;
    this.dispatchEvent('close', null);
  }

  /**
   * Generate a random session ID
   *
   * @returns {string} A random session ID
   */
  generateSessionId() {
    return 'session_' + Math.random().toString(36).substring(2, 15);
  }
}

// Export for CommonJS environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PostEventSource;
}
