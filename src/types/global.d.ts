// global.d.ts
declare namespace JSX {
    interface IntrinsicElements {
        'ion-icon': {
            name?: string;
            size?: string;
            style?: Record<string, string | number>;
            [key: string]: any;
        };
    }
}

export {};
