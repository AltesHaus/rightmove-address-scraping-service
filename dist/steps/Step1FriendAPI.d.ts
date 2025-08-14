import { PipelineStep, PropertyInput, StepResult } from '../utils/types';
export declare class Step1FriendAPI implements PipelineStep {
    name: string;
    private httpClient;
    private baseUrl;
    private userEmail;
    constructor();
    execute(input: PropertyInput): Promise<StepResult>;
    private buildApiUrl;
    private processResponse;
    private extractAddress;
    private looksLikeAddress;
}
//# sourceMappingURL=Step1FriendAPI.d.ts.map