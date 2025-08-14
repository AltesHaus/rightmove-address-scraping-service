import { AxiosRequestConfig } from 'axios';
export declare class HttpClient {
    private defaultTimeout;
    get<T>(url: string, config?: AxiosRequestConfig): Promise<T>;
    post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>;
    private handleError;
    setTimeout(timeoutMs: number): void;
}
//# sourceMappingURL=http.d.ts.map