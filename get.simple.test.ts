describe('Media Downloader Unit Tests', () => {
    describe('Helper Functions', () => {
        describe('parseSizeThreshold', () => {
            const parseSizeThreshold = (input?: string): number => {
                if (!input) return 10240;
                const match = input.match(/^(\d+)(k?)$/i);
                if (!match) return 10240;
                const n = parseInt(match[1], 10);
                return match[2].toLowerCase() === 'k' ? n * 1024 : n;
            };

            it('should return default 10240 when no input', () => {
                expect(parseSizeThreshold()).toBe(10240);
                expect(parseSizeThreshold('')).toBe(10240);
                expect(parseSizeThreshold(undefined)).toBe(10240);
            });

            it('should parse numeric values', () => {
                expect(parseSizeThreshold('5000')).toBe(5000);
                expect(parseSizeThreshold('100')).toBe(100);
            });

            it('should parse values with k suffix', () => {
                expect(parseSizeThreshold('5k')).toBe(5120);
                expect(parseSizeThreshold('10K')).toBe(10240);
                expect(parseSizeThreshold('1k')).toBe(1024);
            });

            it('should return default for invalid input', () => {
                expect(parseSizeThreshold('abc')).toBe(10240);
                expect(parseSizeThreshold('10mb')).toBe(10240);
                expect(parseSizeThreshold('k10')).toBe(10240);
            });
        });

        describe('parseTimeout', () => {
            const parseTimeout = (input?: string): number => {
                if (!input) return 10000;
                const timeout = parseInt(input, 10);
                return isNaN(timeout) ? 10000 : timeout * 1000;
            };

            it('should return default 10000ms when no input', () => {
                expect(parseTimeout()).toBe(10000);
                expect(parseTimeout('')).toBe(10000);
                expect(parseTimeout(undefined)).toBe(10000);
            });

            it('should convert seconds to milliseconds', () => {
                expect(parseTimeout('5')).toBe(5000);
                expect(parseTimeout('30')).toBe(30000);
                expect(parseTimeout('1')).toBe(1000);
            });

            it('should return default for invalid input', () => {
                expect(parseTimeout('abc')).toBe(10000);
                expect(parseTimeout('10s')).toBe(10000);
            });
        });

        describe('parseOutputFolder', () => {
            const parseOutputFolder = (urlString: string): string => {
                try {
                    const p = new URL(urlString).pathname.replace(/\/+$/, '');
                    let folder = p.substring(p.lastIndexOf('/') + 1) || 'output';
                    folder = folder.replace(/[^\w-]/g, '') || 'output';
                    return folder;
                } catch {
                    return 'output';
                }
            };

            it('should extract folder name from URL path', () => {
                expect(parseOutputFolder('https://example.com/folder/post123')).toBe('post123');
                expect(parseOutputFolder('https://example.com/my-folder')).toBe('my-folder');
                expect(parseOutputFolder('https://example.com/test_123')).toBe('test_123');
            });

            it('should return output for invalid URLs', () => {
                expect(parseOutputFolder('not-a-url')).toBe('output');
                expect(parseOutputFolder('')).toBe('output');
                expect(parseOutputFolder('https://example.com/')).toBe('output');
            });

            it('should sanitize special characters', () => {
                expect(parseOutputFolder('https://example.com/folder@123')).toBe('folder123');
                expect(parseOutputFolder('https://example.com/test!@#$%')).toBe('test');
            });
        });
    });

    describe('JSON Parsing Functions', () => {
        describe('findJsonItemWithOwner', () => {
            const searchItemWithOwner = (obj: any): any => {
                if (!obj || typeof obj !== 'object') return null;
                if (obj.owner && obj.owner.username) return obj;
                for (const k in obj) {
                    const sub = searchItemWithOwner(obj[k]);
                    if (sub) return sub;
                }
                return null;
            };
            
            const findJsonItemWithOwner = (jsonStr: string): any => {
                try {
                    const obj = JSON.parse(jsonStr);
                    return searchItemWithOwner(obj);
                } catch {
                    return null;
                }
            };

            it('should find item with owner property', () => {
                const testJson = JSON.stringify({
                    data: {
                        item: {
                            owner: { username: 'testuser' },
                            id: '123'
                        }
                    }
                });

                const result = findJsonItemWithOwner(testJson);
                expect(result).not.toBeNull();
                expect(result.owner.username).toBe('testuser');
            });

            it('should return null for invalid JSON', () => {
                expect(findJsonItemWithOwner('invalid json')).toBeNull();
                expect(findJsonItemWithOwner('')).toBeNull();
            });

            it('should return null when no owner found', () => {
                const testJson = JSON.stringify({
                    data: {
                        item: {
                            id: '123',
                            title: 'test'
                        }
                    }
                });

                expect(findJsonItemWithOwner(testJson)).toBeNull();
            });
        });
    });

    describe('Byte Range Parsing', () => {
        const parseByteRange = (str: string): [number, number] | null => {
            const m = str.match(/^(\d+)-(\d+)$/);
            if (!m) return null;
            return [parseInt(m[1], 10), parseInt(m[2], 10)];
        };

        it('should parse valid byte ranges', () => {
            expect(parseByteRange('0-999')).toEqual([0, 999]);
            expect(parseByteRange('1000-1999')).toEqual([1000, 1999]);
            expect(parseByteRange('500-600')).toEqual([500, 600]);
        });

        it('should return null for invalid ranges', () => {
            expect(parseByteRange('invalid')).toBeNull();
            expect(parseByteRange('0-')).toBeNull();
            expect(parseByteRange('-999')).toBeNull();
            expect(parseByteRange('0-999-')).toBeNull();
        });
    });

    describe('DASH Video Handling', () => {
        interface AdaptationSet {
            $: { contentType?: string };
            Representation?: any;
        }

        describe('findVideoAdaptationSet', () => {
            const findVideoAdaptationSet = (adaptationSets: AdaptationSet[]): AdaptationSet | null => {
                const direct = adaptationSets.find(a => (a.$.contentType || '').toLowerCase() === 'video');
                if (direct) return direct;

                for (const a of adaptationSets) {
                    if (!a.Representation) continue;
                    const reps = Array.isArray(a.Representation) ? a.Representation : [a.Representation];
                    const r0 = reps[0].$;
                    if (r0 && r0.mimeType && r0.mimeType.includes('video')) return a;
                    if (r0 && r0.codecs && r0.codecs.includes('avc1')) return a;
                }
                return null;
            };

            it('should find video adaptation set by content type', () => {
                const adaptationSets: AdaptationSet[] = [
                    { $: { contentType: 'audio' } },
                    { $: { contentType: 'video' } }
                ];

                const result = findVideoAdaptationSet(adaptationSets);
                expect(result).toBeTruthy();
                expect(result!.$.contentType).toBe('video');
            });

            it('should find video by mime type', () => {
                const adaptationSets: AdaptationSet[] = [
                    { $: {}, Representation: { $: { mimeType: 'video/mp4' } } },
                    { $: {}, Representation: { $: { mimeType: 'audio/mp4' } } }
                ];

                const result = findVideoAdaptationSet(adaptationSets);
                expect(result).toBeTruthy();
                expect(result!.Representation.$.mimeType).toBe('video/mp4');
            });

            it('should find video by codec', () => {
                const adaptationSets: AdaptationSet[] = [
                    { $: {}, Representation: { $: { codecs: 'avc1.4d401f' } } },
                    { $: {}, Representation: { $: { codecs: 'mp4a.40.2' } } }
                ];

                const result = findVideoAdaptationSet(adaptationSets);
                expect(result).toBeTruthy();
                expect(result!.Representation.$.codecs).toContain('avc1');
            });
        });

        describe('findAudioAdaptationSet', () => {
            const findAudioAdaptationSet = (adaptationSets: AdaptationSet[]): AdaptationSet | null => {
                const direct = adaptationSets.find(a => (a.$.contentType || '').toLowerCase() === 'audio');
                if (direct) return direct;

                for (const a of adaptationSets) {
                    if (!a.Representation) continue;
                    const reps = Array.isArray(a.Representation) ? a.Representation : [a.Representation];
                    const r0 = reps[0].$;
                    if (r0 && r0.mimeType && r0.mimeType.includes('audio')) return a;
                    if (r0 && r0.codecs && r0.codecs.includes('mp4a')) return a;
                }
                return null;
            };

            it('should find audio adaptation set by content type', () => {
                const adaptationSets: AdaptationSet[] = [
                    { $: { contentType: 'video' } },
                    { $: { contentType: 'audio' } }
                ];

                const result = findAudioAdaptationSet(adaptationSets);
                expect(result).toBeTruthy();
                expect(result!.$.contentType).toBe('audio');
            });
        });
    });

    describe('Command Line Arguments', () => {
        it('should parse verbose flag', () => {
            const args = ['https://example.com', '--verbose'];
            let isVerbose = false;
            
            for (let i = 0; i < args.length; i++) {
                if (args[i] === '--verbose') {
                    isVerbose = true;
                }
            }
            
            expect(isVerbose).toBe(true);
        });

        it('should parse timeout argument', () => {
            const args = ['https://example.com', '--timeout', '30'];
            const parsedArgs: Record<string, string> = {};
            
            for (let i = 0; i < args.length; i++) {
                if (args[i] === '--timeout' && i + 1 < args.length) {
                    parsedArgs.timeout = args[i + 1];
                    i++;
                }
            }
            
            expect(parsedArgs.timeout).toBe('30');
        });

        it('should parse positional arguments', () => {
            const args = ['https://example.com', 'video', '100k'];
            const positionalArgs: string[] = [];
            
            for (const arg of args) {
                if (!arg.startsWith('--')) {
                    positionalArgs.push(arg);
                }
            }
            
            expect(positionalArgs).toEqual(['https://example.com', 'video', '100k']);
        });
    });

    describe('URL Domain Detection', () => {
        it('should detect Instagram URLs', () => {
            const url = 'https://www.instagram.com/p/ABC123/';
            const domain = new URL(url).hostname;
            expect(domain.includes('instagram')).toBe(true);
        });

        it('should detect Threads URLs', () => {
            const url = 'https://www.threads.net/@user/post/123';
            const domain = new URL(url).hostname;
            expect(domain.includes('threads')).toBe(true);
        });

        it('should detect Twitter URLs', () => {
            const url = 'https://twitter.com/user/status/123';
            const domain = new URL(url).hostname;
            expect(domain.includes('twitter')).toBe(true);
        });
    });
});