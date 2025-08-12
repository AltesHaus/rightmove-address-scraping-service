import axios, { AxiosResponse, AxiosRequestConfig } from 'axios';
import { APIError, TimeoutError } from './errors';

export class HttpClient {
  private defaultTimeout = 30000; // 30 seconds

  async get<T>(
    url: string, 
    config: AxiosRequestConfig = {}
  ): Promise<T> {
    try {
      const response: AxiosResponse<T> = await axios.get(url, {
        timeout: this.defaultTimeout,
        ...config,
      });
      return response.data;
    } catch (error: any) {
      this.handleError(error, 'GET', url);
      throw error; // TypeScript requires this, but it's unreachable
    }
  }

  async post<T>(
    url: string, 
    data?: any, 
    config: AxiosRequestConfig = {}
  ): Promise<T> {
    try {
      const response: AxiosResponse<T> = await axios.post(url, data, {
        timeout: this.defaultTimeout,
        ...config,
      });
      return response.data;
    } catch (error: any) {
      this.handleError(error, 'POST', url);
      throw error; // TypeScript requires this, but it's unreachable
    }
  }

  private handleError(error: any, method: string, url: string): never {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw new TimeoutError(
        `${method} request to ${url} timed out after ${this.defaultTimeout}ms`,
        this.defaultTimeout
      );
    }

    if (error.response) {
      // API returned an error response
      throw new APIError(
        `${method} request failed: ${error.response.statusText}`,
        error.response.status,
        url,
        error
      );
    } else if (error.request) {
      // Network error
      throw new APIError(
        `Network error during ${method} request to ${url}`,
        undefined,
        url,
        error
      );
    } else {
      // Other error
      throw new APIError(
        `Unexpected error during ${method} request to ${url}: ${error.message}`,
        undefined,
        url,
        error
      );
    }
  }

  setTimeout(timeoutMs: number): void {
    this.defaultTimeout = timeoutMs;
  }
}