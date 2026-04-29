import net from 'net';

// client types
export interface EveloDBClientConfig {
    host?: string;
    port?: number;
    user?: string;
    key?: string;
    noRepeat?: boolean;
    autoPrimaryKey?: boolean | string;
    returnRequestInfo?: boolean;
}

export interface AnalyseResponse<T = any> {
    indexes: number[];
    reason: string;
    message: string;
    data: T[];
}

export type RequestResult<T> = T | {
    success: boolean;
    status: number;
    latency?: number;
    data: T;
    message?: string;
};

export class QueryResult<T = any> {
    data: T[];

    constructor(data: T | T[]) {
        this.data = Array.isArray(data) ? data : [data];
    }

    getList(offset: number = 0, limit: number = 10): T[] {
        return this.data.slice(offset, offset + limit);
    }

    count(): number {
        return this.data.length;
    }

    sort(compareFn: (a: T, b: T) => number): QueryResult<T> {
        return new QueryResult([...this.data].sort(compareFn));
    }

    all(): T[] {
        return this.data;
    }
}

// Default configuration
const defaultConfig: EveloDBClientConfig = {
    host: '127.0.0.1',
    port: 7962,
    user: '',
    key: '',
    noRepeat: false,
    autoPrimaryKey: true,
    returnRequestInfo: false
};

class eveloDB {
    config: EveloDBClientConfig;

    constructor(config: EveloDBClientConfig = {}) {
        this.config = { ...defaultConfig, ...config };

        if (!this.config.host || !this.config.port) {
            throw new Error('Missing server host or port in config');
        }

        if (!this.config.user || !this.config.key) {
            throw new Error('Missing database user or key in config');
        }
    }

    /**
     * Internal helper to make a request to the server over TCP
     */
    async _request<T = any>(action: string, ...data: any[]): Promise<RequestResult<T>> {
        const { host, port, user, key, noRepeat, autoPrimaryKey, returnRequestInfo } = this.config;

        const payload = {
            action,
            config: { user, key, noRepeat, autoPrimaryKey },
            data
        };

        return new Promise((resolve) => {
            const startTime = Date.now();
            const client = new net.Socket();
            let responseBuffer = '';

            client.connect(port || 7562, host || '127.0.0.1', () => {
                client.write(JSON.stringify(payload));
            });

            client.on('data', (chunk) => {
                responseBuffer += chunk.toString();

                try {
                    const response = JSON.parse(responseBuffer);

                    let parsedData: any;

                    if (['find', 'search', 'get'].includes(action) && Array.isArray(response.result)) {
                        parsedData = new QueryResult(response.result);
                    } else if (['findOne'].includes(action)) {
                        parsedData = response.result;
                    } else {
                        parsedData = response.result || response;
                    }

                    const latency = Date.now() - startTime;

                    if (!returnRequestInfo) {
                        resolve(parsedData as T);
                    } else {
                        resolve({
                            success: true,
                            status: 200,
                            latency,
                            data: parsedData as T
                        });
                    }

                    client.end();
                } catch (e) {
                    // Wait for full response if JSON not complete yet
                }
            });

            client.on('error', (err: any) => {
                resolve({
                    success: false,
                    status: err.code || 500,
                    message: err.message || 'Socket error',
                    data: null as any
                });
            });

            client.on('timeout', () => {
                client.destroy();
                resolve({
                    success: false,
                    status: 408,
                    message: 'Request timed out',
                    data: null as any
                });
            });

            client.on('end', () => {
                if (!responseBuffer) {
                    resolve({
                        success: false,
                        status: 404,
                        message: 'No response from server',
                        data: null as any
                    });
                }
            });
        });
    }

    // CRUD Operations
    async create(collection: string, data: object) { return this._request('create', collection, data); }
    async edit(collection: string, conditions: object, newData: object) { return this._request('edit', collection, conditions, newData); }
    async remove(collection: string, conditions: object) { return this._request('remove', collection, conditions); }
    async delete(collection: string, conditions: object) { return this._request('delete', collection, conditions); }

    // Query Operations
    async find<T = any>(collection: string, conditions: object): Promise<RequestResult<QueryResult<T>>> {
        return this._request<QueryResult<T>>('find', collection, conditions);
    }
    async findOne<T = any>(collection: string, conditions: object): Promise<RequestResult<T | null>> {
        return this._request<T | null>('findOne', collection, conditions);
    }
    async search<T = any>(collection: string, conditions: object): Promise<RequestResult<QueryResult<T>>> {
        return this._request<QueryResult<T>>('search', collection, conditions);
    }
    async get<T = any>(collection: string): Promise<RequestResult<QueryResult<T>>> {
        return this._request<QueryResult<T>>('get', collection);
    }
    async count(collection: string): Promise<RequestResult<{ success: boolean; count?: number; err?: string }>> {
        return this._request('count', collection);
    }
    async check(collection: string, data: object): Promise<RequestResult<boolean>> {
        return this._request<boolean>('check', collection, data);
    }
    async analyse<T = any>(params: {
        collection?: string;
        filter?: object;
        data?: any[];
        model: string;
        apiKey: string;
        query: string;
    }): Promise<RequestResult<{ success: boolean; response?: AnalyseResponse<T>; err?: string }>> {
        return this._request('analyse', params);
    }

    // Collection Management
    async drop(collection: string): Promise<RequestResult<{ success: boolean } | { err: any }>> {
        return this._request('drop', collection);
    }
    async reset(collection: string): Promise<RequestResult<{ success: boolean } | { err: any }>> {
        return this._request('reset', collection);
    }
    async inject(collection: string, data: any): Promise<RequestResult<{ success: boolean }>> {
        return this._request('inject', collection, data);
    }
    async writeData(collection: string, data: any): Promise<RequestResult<{ success: boolean }>> {
        return this._request('writeData', collection, data);
    }
    async readData<T = any>(collection: string): Promise<RequestResult<T>> {
        return this._request<T>('readData', collection);
    }

    // File Management
    async writeFile(name: string, data: Buffer) { return this._request('writeFile', name, data); }
    async allFiles() { return this._request('allFiles'); }
    async readFile(name: string) { return this._request('readFile', name); }
    async deleteFile(name: string) { return this._request('deleteFile', name); }
}

export default eveloDB;

// CommonJS backwards compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = eveloDB;
    module.exports.default = eveloDB;
    module.exports.eveloDB = eveloDB;
}