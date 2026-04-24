// Base class: WebGLRenderer
class WebGLRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        // Configuration
        this.GRID_N = 128; // Grid resolution
        this.GRID_N_SQUARED = this.GRID_N * this.GRID_N;
        
        // WebGL resources
        this.shaderProgram = null;
        this.positionBuffer = null;
        this.indexBuffer = null;
        this.gridData = null;

        // Initialize WebGL and shaders
        this.initWebGL();
    }

    // Helper method to load and compile a shader
    loadShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('An error occurred compiling the shaders:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    // Initialize and link the shader program
    initShaderProgram(vsSource, fsSource) {
        const vertexShader = this.loadShader(this.gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.loadShader(this.gl.FRAGMENT_SHADER, fsSource);

        const shaderProgram = this.gl.createProgram();
        this.gl.attachShader(shaderProgram, vertexShader);
        this.gl.attachShader(shaderProgram, fragmentShader);
        this.gl.linkProgram(shaderProgram);

        if (!this.gl.getProgramParameter(shaderProgram, this.gl.LINK_STATUS)) {
            console.error('Unable to initialize the shader program:', this.gl.getProgramInfoLog(shaderProgram));
            return null;
        }

        return shaderProgram;
    }

    // Generate grid vertices and indices
    generateGridVertices(N) {
        const vertices = [];
        const indices = [];
        const step = 2 / (N - 1); // Normalized device coordinates range from -1 to 1

        for (let i = 0; i < N; i++) {
            for (let j = 0; j < N; j++) {
                // X and Y positions
                const x = -1 + j * step;
                const y = 1 - (i * step); //Upside down
                // S and T texture coordinates
                const s = j / (N - 1);
                const t = i / (N - 1);
                vertices.push(x, y, s, t);
            }
        }

        for (let i = 0; i < N - 1; i++) {
            for (let j = 0; j < N - 1; j++) {
                const topLeft = i * N + j;
                const bottomLeft = (i + 1) * N + j;
                const topRight = topLeft + 1;
                const bottomRight = bottomLeft + 1;

                // First triangle
                indices.push(topLeft, bottomLeft, topRight);
                // Second triangle
                indices.push(topRight, bottomLeft, bottomRight);
            }
        }

        return {
            vertices: new Float32Array(vertices),
            indices: new Uint16Array(indices)
        };
    }

    // Initialize WebGL context, shaders, and buffers
    initWebGL() {
        this.gl = this.canvas.getContext("webgl") || this.canvas.getContext("experimental-webgl");
        if (!this.gl) {
            console.error("Unable to initialize WebGL. Your browser or machine may not support it.");
            return;
        }

        console.log("Super Init")
        const gl = this.gl;

        // Vertex shader program
        const vsSource = `
            attribute vec4 aVertexPosition;
            attribute vec2 aTextureCoord;
            varying highp vec2 vTextureCoord;
            void main(void) {
                gl_Position = aVertexPosition;
                vTextureCoord = aTextureCoord;
            }
        `;

        // Fragment shader program
        const fsSource = `
            precision mediump float;
            varying highp vec2 vTextureCoord;
            uniform sampler2D uSampler;
            uniform float uAlpha;
            void main(void) {
                vec4 color = texture2D(uSampler, vTextureCoord);
                gl_FragColor = vec4(color.rgb, color.a * uAlpha);
            }
        `;

        // Initialize shader program
        this.shaderProgram = this.initShaderProgram(vsSource, fsSource);
        if (!this.shaderProgram) {
            console.error("Failed to initialize shader program.");
            return;
        }

        gl.useProgram(this.shaderProgram);

        // Get attribute locations
        this.vertexPosition = gl.getAttribLocation(this.shaderProgram, 'aVertexPosition');
        this.textureCoord = gl.getAttribLocation(this.shaderProgram, 'aTextureCoord');

        // Enable vertex attributes
        gl.enableVertexAttribArray(this.vertexPosition);
        gl.enableVertexAttribArray(this.textureCoord);

        // Generate grid data
        this.gridData = this.generateGridVertices(this.GRID_N);

        // Create and bind position buffer
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.gridData.vertices, gl.DYNAMIC_DRAW);

        // Define stride and offsets
        const stride = 4 * 4; // 4 floats per vertex, 4 bytes per float
        const positionOffset = 0;
        const textureCoordOffset = 2 * 4; // Start at the third float

        // Define vertex attribute pointers
        gl.vertexAttribPointer(this.vertexPosition, 2, gl.FLOAT, false, stride, positionOffset);
        gl.vertexAttribPointer(this.textureCoord, 2, gl.FLOAT, false, stride, textureCoordOffset);

        // Create and bind index buffer
        this.indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.gridData.indices, gl.STATIC_DRAW);

        // Set clear color to black, fully opaque
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
    }

    // Update vertex positions
    updateVertices(positions = null) {
        const gl = this.gl;

        if (positions === null) {
            // Dynamic wave effect
            for (let i = 0; i < this.gridData.vertices.length; i += 4) {
                const x = this.gridData.vertices[i];
                const y = this.gridData.vertices[i + 1];
                this.gridData.vertices[i + 1] = y + Math.sin(x * 10 + performance.now() / 1000) * 0.01;
            }
        } else {
            // Update with provided positions
            if (positions.length !== this.gridData.vertices.length / 4) {
                console.error("Invalid positions array length. Expected:", this.gridData.vertices.length / 4);
                return;
            }

            for (let i = 0; i < this.gridData.vertices.length; i += 4) {
                this.gridData.vertices[i] = positions[i / 4][0];     // X position
                this.gridData.vertices[i + 1] = positions[i / 4][1]; // Y position
            }
        }

        // Update the vertex buffer with new data
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.gridData.vertices);
    }

    // Draw textures onto the canvas
    drawTexture(texture1, texture2 = null, alpha1 = 1.0, alpha2 = 0.5) {
        const gl = this.gl;

        // Clear the canvas
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Enable blending
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        // Draw first texture
        gl.uniform1f(gl.getUniformLocation(this.shaderProgram, 'uAlpha'), alpha1);
        gl.bindTexture(gl.TEXTURE_2D, texture1);
        gl.uniform1i(gl.getUniformLocation(this.shaderProgram, 'uSampler'), 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.drawElements(gl.TRIANGLES, this.gridData.indices.length, gl.UNSIGNED_SHORT, 0);

        // Draw second texture if provided
        if (texture2) {
            gl.uniform1f(gl.getUniformLocation(this.shaderProgram, 'uAlpha'), alpha2);
            gl.bindTexture(gl.TEXTURE_2D, texture2);
            gl.uniform1i(gl.getUniformLocation(this.shaderProgram, 'uSampler'), 0);
            gl.drawElements(gl.TRIANGLES, this.gridData.indices.length, gl.UNSIGNED_SHORT, 0);
        }

        // Disable blending
        gl.disable(gl.BLEND);
    }

    // Create a texture from an ImageBitmap
    createTextureFromImageBitmap(imageBitmap) {
        const gl = this.gl;
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);

        // Upload the ImageBitmap into the texture
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageBitmap);

        // Set texture parameters
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        return texture;
    }

    // Asynchronously load a texture from a URL
    async loadTexture(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${url}`);
        }
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob, { imageOrientation: "flipY" });

        return this.createTextureFromImageBitmap(imageBitmap);
    }

    // Update an existing texture with a new ImageBitmap
    updateTextureWithImageBitmap(texture, imageBitmap) {
        const gl = this.gl;
        if (!texture) {
            console.error('Texture is null or undefined.');
            return null;
        }

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageBitmap);

        return texture;
    }

    // Copy the current canvas content to a texture
    copyCanvasToTexture(targetTexture) {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, targetTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, this.canvas.width, this.canvas.height, 0);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }

    // Initialize a target texture for rendering
    initTargetTexture() {
        const gl = this.gl;
        const targetTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, targetTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.canvas.width, this.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        return targetTexture;
    }

    // Draw a frame or ImageBitmap onto the canvas
    draw(frameOrBitmap) {
        const gl = this.gl;

        // Determine dimensions based on the input type
        const width = frameOrBitmap.displayWidth || frameOrBitmap.width;
        const height = frameOrBitmap.displayHeight || frameOrBitmap.height;

        // Resize canvas if necessary
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            gl.viewport(0, 0, width, height);
        }

        // Create texture from the frameOrBitmap
        const texture = this.createTextureFromImageBitmap(frameOrBitmap);

        // Draw the texture
        this.drawTexture(texture);

        // Clean up
        gl.deleteTexture(texture);

        // If it's a VideoFrame, close it to free resources
        if (frameOrBitmap instanceof VideoFrame) {
            frameOrBitmap.close();
        }
    }

    // Helper method to add a delay (optional)
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}


const USE_LAPLACIAN_SMOOTHING = false;
const KP_NUM = 254;
const FACE_IMG_SIZE = 1024; //This is a constant, where kp info is calculated for 1024x1024 image.
//const NTK; This is defined in load_data.js

// Extended class: WebGLRendererX
class WebGLRendererX extends WebGLRenderer {
    constructor(canvas, dataManager) {
        super(canvas); // initWebGL() is called here

        this.dataManager = dataManager;
        this.version = "Y";
        this.texture0 = null;  // Initialize texture0 to null
        this.prevTexture = null;

        this.indicesTexture = null;  // Initialize data textures to null
        this.weightsTexture = null;
        this.diffTexture = null;

        const gl = this.gl;
        const maxTextureUnits = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
        const maxVertexShaderTextureUnits = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS);
        const maxFragmentShaderTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);

        console.log("Max texture units:", maxTextureUnits);
        console.log("Max vertex shader texture units:", maxVertexShaderTextureUnits);
        console.log("Max fragment shader texture units:", maxFragmentShaderTextureUnits);

        const N = this.gridData.vertices.length / 4;
        this.indicesArray0 = new Uint8Array(N * NTK);
        this.weightsArray0 = new Uint8Array(N * NTK);  
        this.diffArray0 = new Float32Array(KP_NUM * 4);

        // this.indicesArray = new Uint8Array(N * NTK);
        // this.weightsArray = new Uint8Array(N * NTK);  
        this.diffArray = new Float32Array(KP_NUM * 4);

        this.image_size = null;
        this.rect = null;
        this.global_transform = null;
        
        //this.prepareDataTextures();
        //this.setInfo();
    }

    setInfo()
    {
        //console.warn("setInfo is called");
        if ("rect" in this.dataManager.dataDictionary) {
           this.rect = this.dataManager.dataDictionary["rect"];
        }
        else{
            console.error("dataDictionary does not contain the 'rect' key.");
        }

        if ("image_size" in this.dataManager.dataDictionary) {
            this.image_size = this.dataManager.dataDictionary["image_size"];
        }
        else{
            console.error("dataDictionary does not contain the 'rect' key.");
        }
        //console.warn(this.rect, this.image_size);
    }

    setGlobalTransform(transform) {
        //check if is list of 4 [sx, sy, tx, ty]
        if (Array.isArray(transform) && transform.length === 4) {
            this.global_transform = transform;
        } else {
            console.error('Invalid transform: Must be an array of 4 numbers [sx, sy, tx, ty]');
        }
        this.global_transform = transform;
    }

    // Override initWebGL to customize shaders or initialization
    initWebGL() {
        // Override the WebGL context to use WebGL2
        this.gl = this.canvas.getContext('webgl2');
        if (!this.gl) {
            console.error("WebGL2 not available");
            return;
        }

        console.log("Child Init");

        const gl = this.gl;

        // Vertex shader program with calculations moved to shader
        const vsSource = `#version 300 es
            in vec4 aVertexPosition;
            in vec2 aTextureCoord;
            out vec2 vTextureCoord;
            out vec3 vDiff0;
            out float vEdgeFactor; // Edge factor for blending

            // Data textures
            uniform highp usampler2D uIndicesTexture; // Use usampler2D for unsigned integer textures
            uniform highp usampler2D uWeightsTexture; // Use usampler2D for weights stored as uint8
            uniform sampler2D uDiffTexture; // float texture

            // Scaling and shifting uniforms
            uniform vec2 uRectScale;
            uniform vec2 uRectShift;
            uniform vec2 uGlobalScale;
            uniform vec2 uGlobalShift;

            void main(void) {
                int vertexID = gl_VertexID;
                int vertexID_x = vertexID % ${this.GRID_N};
                int vertexID_y = vertexID / ${this.GRID_N};

                // Fetch indices and weights
                vec3 weightedDiff = vec3(0, 0, 0);
                float w = 0.0f;

                int repeat = ${NTK}/4;
                for(int i = 0; i < repeat; ++i)
                {
                    ivec2 texCoord = ivec2(vertexID_x * repeat + i, vertexID_y);
                    uvec4 indices = texelFetch(uIndicesTexture, texCoord, 0);  // Unsigned integers
                    vec4 weights = vec4(texelFetch(uWeightsTexture, texCoord, 0)) / 255.0; // Convert weights to floats and normalize            

                    // Fetch keypoint differences
                    vec4 diff0 = texelFetch(uDiffTexture, ivec2(int(indices.x), 0), 0);
                    vec4 diff1 = texelFetch(uDiffTexture, ivec2(int(indices.y), 0), 0);
                    vec4 diff2 = texelFetch(uDiffTexture, ivec2(int(indices.z), 0), 0);
                    vec4 diff3 = texelFetch(uDiffTexture, ivec2(int(indices.w), 0), 0);

                    // Adjust position
                    weightedDiff += diff0.rgb * weights.x + diff1.rgb * weights.y + diff2.rgb * weights.z + diff3.rgb * weights.w;
                    w += weights.x + weights.y + weights.z + weights.w;
                }
                
                // Adjust position
                gl_Position = aVertexPosition + vec4(weightedDiff.xy, 0.0, 0.0);

                if(uRectScale.x != 1.0 && uRectScale.y != 1.0)
                {
                    // Compute edge factor based on gl_Position
                    float margin = 0.20;

                    // Calculate distance to boundary
                    float distanceToBoundaryX = 1.0 - abs(gl_Position.x / gl_Position.w);
                    float distanceToBoundaryY = 1.0 + (gl_Position.y / gl_Position.w); //only bottom side
                    
                    float distanceToBoundary = min(distanceToBoundaryX, distanceToBoundaryY);// * distanceToBoundaryX;

                    vEdgeFactor = clamp(distanceToBoundary/margin, 0.0, 1.0);
                    vEdgeFactor = vEdgeFactor * vEdgeFactor;

                    gl_Position.xy = gl_Position.xy * uRectScale + uRectShift;
                }
                else
                {
                    vEdgeFactor = 1.0;

                    gl_Position.xy = gl_Position.xy * uRectScale + uRectShift;
                    gl_Position.xy = gl_Position.xy * uGlobalScale + uGlobalShift;
                    
                }

                

                vTextureCoord = aTextureCoord;

                vDiff0 = vec3(weightedDiff.xy, 0.0);
            }
        `;

        // Fragment shader program with alpha blending
        const fsSource = `#version 300 es
            precision mediump float;
            in vec2 vTextureCoord;
            in vec3 vDiff0;
            in float vEdgeFactor;
            out vec4 fragColor;

            uniform sampler2D uTexture0;
            uniform float uAlpha0;
            uniform float uHeight;
            uniform float uFlipY;

            void main(void) {

                vec2 uv = vTextureCoord;
                if(uFlipY > 0.5) {
                    uv.y = 1.0 - uv.y;
                }

                fragColor = texture(uTexture0, uv);
                fragColor.r = vDiff0.x * 10.0 + 0.5;
                fragColor.g = vDiff0.y * 10.0 + 0.5;
                fragColor.b = 0.5;

                float alpha = vEdgeFactor;
    
                // fragColor.r = 1.0 - vEdgeFactor;
                // fragColor.g = 0.0;
                // fragColor.b = 0.0;

                alpha = max(0.0, alpha);
                alpha = min(1.0, alpha);

                //fragColor.a = fragColor.a * fragColor.a * fragColor.a;
                fragColor.a *= alpha;
                fragColor.a += 0.2;
            }
        `;

        // Initialize shader program
        this.shaderProgram = this.initShaderProgram(vsSource, fsSource);
        if (!this.shaderProgram) {
            console.error("Failed to initialize shader program.");
            return;
        }

        gl.useProgram(this.shaderProgram);

        // Get attribute and uniform locations
        this.vertexPosition = gl.getAttribLocation(this.shaderProgram, 'aVertexPosition');
        this.textureCoord = gl.getAttribLocation(this.shaderProgram, 'aTextureCoord');

        this.uIndicesTexture = gl.getUniformLocation(this.shaderProgram, 'uIndicesTexture');
        this.uWeightsTexture = gl.getUniformLocation(this.shaderProgram, 'uWeightsTexture');
        this.uDiffTexture = gl.getUniformLocation(this.shaderProgram, 'uDiffTexture');

        // Retrieve uniform locations for uTexture0 and uAlpha0
        this.uTexture0 = gl.getUniformLocation(this.shaderProgram, 'uTexture0');
        this.uAlpha0 = gl.getUniformLocation(this.shaderProgram, 'uAlpha0');
        this.uHeight = gl.getUniformLocation(this.shaderProgram, 'uHeight');
        this.uFlipY = gl.getUniformLocation(this.shaderProgram, 'uFlipY');

        this.uRectScale = gl.getUniformLocation(this.shaderProgram, 'uRectScale');
        this.uRectShift = gl.getUniformLocation(this.shaderProgram, 'uRectShift');
        this.uGlobalScale = gl.getUniformLocation(this.shaderProgram, 'uGlobalScale');
        this.uGlobalShift = gl.getUniformLocation(this.shaderProgram, 'uGlobalShift');

        // Enable vertex attributes
        gl.enableVertexAttribArray(this.vertexPosition);
        gl.enableVertexAttribArray(this.textureCoord);

        // Generate grid data
        this.gridData = this.generateGridVertices(this.GRID_N);

        // Create and bind position buffer
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.gridData.vertices, gl.DYNAMIC_DRAW);

        // Set up attribute pointers for position and texture coordinates
        const stride = 4 * 4; // 4 floats per vertex
        const positionOffset = 0;
        const textureCoordOffset = 2 * 4; // Start at the third float

        gl.vertexAttribPointer(this.vertexPosition, 2, gl.FLOAT, false, stride, positionOffset);
        gl.vertexAttribPointer(this.textureCoord, 2, gl.FLOAT, false, stride, textureCoordOffset);

        // Create and bind index buffer
        this.indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.gridData.indices, gl.STATIC_DRAW);

        // Set clear color
        //gl.clearColor(0.0, 1.0, 0.0, 1.0);
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
    }

    // Update or create data texture with new data
    updateDataTexture(textureType, width, height, data, isInteger = false) {
        const gl = this.gl;
        if(!gl)
        {
            console.error("gl is empty");
        }

        try{
            if(width == this.GRID_N_SQUARED && height == 1)
            {
                width = this.GRID_N;
                height = this.GRID_N;
                if(NTK == 8)
                {
                    width *= 2;
                }
            }
            
            // Check if the texture is already created, if not create it
            if (!this[textureType]) {
                console.log(`${textureType} not created. Creating new texture...`);
                this[textureType] = gl.createTexture();  // Create a new texture
                if (!this[textureType]) {
                    console.error(`Failed to create ${textureType} texture.`, this.gl);
                    console.error('gl.getError:', gl.getError()); //Error "37442"
                }
                gl.bindTexture(gl.TEXTURE_2D, this[textureType]);

                // Setup texture parameters (only needed for the first time)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

                //console.log(width, height, data);
                // Allocate texture storage and initialize with data
                if (isInteger) {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, width, height, 0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, data);
                } else {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
                }
            } else {
                // Texture already exists, update the texture data
                gl.bindTexture(gl.TEXTURE_2D, this[textureType]);

                // Update the texture content using texSubImage2D
                if (isInteger) {
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, data);
                } else {
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.FLOAT, data);
                }
            }
        }
        catch(e)
        {
            console.error("updateDataTexture", e);
        }

        // Unbind the texture after updating
        //gl.bindTexture(gl.TEXTURE_2D, null);
    }

    // Update image texture (e.g., bitmap) with new data
    createTexture(bitmap=null, width=-1, height=-1) {
        const gl = this.gl;
        if(!gl)
        {
            console.error("gl is empty");
        }

        if(width == -1)
        {
            if(bitmap == null)
            {
                return;
            }
            width = bitmap.width;
            height = bitmap.height;
        }
        
        let texture;
        try{
            console.log("Creating new texture for face or bg");
            texture = gl.createTexture();  // Create a new texture
            gl.bindTexture(gl.TEXTURE_2D, texture);

            // Setup texture parameters (only needed for the first time)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            // Allocate texture storage with an initial image
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
        }
        catch(e)
        {
            console.error("createTexture", e);
        }

        return texture;
    }

    updateTexture(texture, bitmap) {
        const gl = this.gl;
        // Texture already exists, update with new image data
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, bitmap.width, bitmap.height, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
        
    }

    updateImageTexture(bitmap) {

        // Automatically check if the texture is already created
        if (!this.texture0) {
            this.texture0 = this.createTexture(bitmap);
        } else {
            this.updateTexture(this.texture0, bitmap);
        }
     
    }

    updateImageTextureBG(bitmap) {

        // Automatically check if the texture is already created
        if (!this.textureBG) {
            this.textureBG = this.createTexture(bitmap);
        } else {
            this.updateTexture(this.textureBG, bitmap);
        }
     
    }

    // Method to prepare data textures
    prepareDataTextures(bid=-1, mode=0, animation_kp=undefined) {
        const gl = this.gl;
        const N = this.gridData.vertices.length / 4;

        // Number of vertices (assuming each vertex has 4 components: x, y, u, v)
        let indicesArray, weightsArray, diffArray;
        let height = -1.0;

        if(bid==-1 || mode == 3 || mode == 4)
        {
            indicesArray = this.indicesArray0;
            weightsArray = this.weightsArray0;  
            diffArray = this.diffArray0;

        }
        else
        {
            //TODO Move these code to dataManager
            let KI, KW, KK;

            if(mode == 0)
            {
                KI = 'TI.png';
                KW = 'TW.png';
                KK = 'TK.png';
            }
            else if(mode == 1)
            {
                KI = 'BI.png';
                KW = 'BW.png';
                KK = 'BK.png';
            }
            else if(mode == 2)
            {
                KI = 'PI.png';
                KW = 'PW.png';
                KK = 'PK.png';
            }

             // Retrieve data from dataDictionary
            const indices = this.dataManager.dataDictionary[KI];       // ndarray of shape [625, 16384, NTK]
            const weights = this.dataManager.dataDictionary[KW]; // ndarray of shape [625, 16384, NTK]
            const bottom_kp = this.dataManager.dataDictionary[KK];       // ndarray of shape [625, 249, 3]

            if(indices == undefined || weights == undefined || bottom_kp == undefined)
            {
                //console.warn("prepareDataTextures: found undefined");
                return;
            }
            // console.log(typeof bid, bid);

            // console.log(idx, bid);
            // Select indices and weights for the given idx
            const idxIndices = indices.pick(bid); // Shape: [16384, NTK]
            const idxWeights = weights.pick(bid); // Shape: [16384, NTK]

            // Flatten to arrays
            if(false)
            {
                indicesArray = new Uint8Array(idxIndices.flatten().selection.data);
                weightsArray = new Uint8Array(idxWeights.flatten().selection.data);

            }
            else
            {
                indicesArray = idxIndices.flatten().selection.data; //new Uint8Array(idxIndices.flatten().selection.data);
                weightsArray = idxWeights.flatten().selection.data; //new Uint8Array(idxWeights.flatten().selection.data);
                diffArray = this.diffArray;//Copy data
            }
            
            // diffArray = new Float32Array(KP_NUM * 4); // Allocate space for 4 components

            const kps0 = animation_kp; // Shape: [249, 3]
            const kps1 = bottom_kp.pick(bid);    // Shape: [249, 3]
            //console.log(kps0.shape, kps1.shape, bottom_kp.shape, bottom_idx.shape);
            let diff = kps0.subtract(kps1).divide(FACE_IMG_SIZE / 2);

            // Invert y-coordinate
            //diff.slice(null, [1, 2]).assign(diff.slice(null, [1, 2]).multiply(-1), false);

            // Flatten diff to array and pad to 4 components per pixel
            let diffData = diff.flatten().selection.data; // Length: 249 * 3

            if(USE_LAPLACIAN_SMOOTHING && laplacian_neighbours != null)
            {
                diffData = laplacianSmoothingFlat(diffData, laplacian_neighbours);
            }
            
            for (let i = 0; i < diff.shape[0]; i++) {
                diffArray[i * 4] = diffData[i * 3 + 0];       // x component
                diffArray[i * 4 + 1] = -diffData[i * 3 + 1]; // Invert y-coordinate
                diffArray[i * 4 + 2] = 0.0;//diffData[i * 3 + 2]; // z component
                diffArray[i * 4 + 3] = 0.0;                // Padding
            }
        }
        
        
        
        // Bind the textures to texture units and set uniforms
        gl.useProgram(this.shaderProgram);

        gl.activeTexture(gl.TEXTURE0);
        this.updateDataTexture('indicesTexture', N, 1, indicesArray, true);
        //gl.bindTexture(gl.TEXTURE_2D, this.indicesTexture);
        gl.uniform1i(this.uIndicesTexture, 0);

        gl.activeTexture(gl.TEXTURE1);
        this.updateDataTexture('weightsTexture', N, 1, weightsArray, true);
        //gl.bindTexture(gl.TEXTURE_2D, this.weightsTexture);
        gl.uniform1i(this.uWeightsTexture, 1);

        gl.activeTexture(gl.TEXTURE2);
        this.updateDataTexture('diffTexture', KP_NUM, 1, diffArray);
        //gl.bindTexture(gl.TEXTURE_2D, this.diffTexture);
        gl.uniform1i(this.uDiffTexture, 2);

        //gl.uniform1f(this.uHeight, height); // Adjust as needed
    }
    // Override draw method to add custom behavior

    calculateRectTransform(faceX, faceY, faceWidth, faceHeight, canvasWidth, canvasHeight) {
        const scaleX = (faceWidth / canvasWidth);
        const scaleY = (faceHeight / canvasHeight);
    
        const shiftX = (faceX / canvasWidth) * 2.0 - (1.0 - scaleX); //Center is zero for GL
        const shiftY = -((faceY / canvasHeight) * 2.0 - (1.0 - scaleY)); //Invert Y coord
    
        return { scaleX, scaleY, shiftX, shiftY };
    }

    setScissor(mode){
        const gl = this.gl;
        const canvas = this.canvas;
        //TODO canvas.width/height should be changed to the size of whole image.
        if(mode <= 2 && this.rect != null)
        {
            let [ faceX, faceY, faceWidth, faceHeight ] = this.rect;

            const [ bodyWidth, bodyHeight ] = this.image_size;

            gl.enable(gl.SCISSOR_TEST);
            //gl.scissor(0, 0, canvas.width, canvas.height);
            let rx = canvas.width / bodyWidth;
            let ry = canvas.height / bodyHeight;

            ///////////////////////////////////////////
            let transforms = this.global_transform ? this.global_transform : [1.0, 1.0, 0.0, 0.0];
            const [ gscaleX, gscaleY, gshiftX, gshiftY ] = transforms;

            // Convert the global transformation (in normalized coordinates) to pixel space
            const pixelShiftX = gshiftX * bodyWidth * 0.5; // Convert X shift to pixels
            const pixelShiftY = gshiftY * bodyHeight * -0.5; // Convert Y shift to pixels
            const pixelScaleX = gscaleX;  
            const pixelScaleY = gscaleY;

            // Apply global transformation in pixel coordinates
            faceX = (faceX - bodyWidth/2) * pixelScaleX + pixelShiftX + bodyWidth/2;
            faceY = (faceY - bodyHeight/2) * pixelScaleY + pixelShiftY + bodyHeight/2;
            faceWidth = faceWidth * pixelScaleX;
            faceHeight = faceHeight * pixelScaleY;
            ///////////////////////////////////////////


            gl.scissor(faceX * rx, (bodyHeight - faceY - faceHeight) * ry, faceWidth * rx, faceHeight * ry); //Flip Y
            
            //console.warn(faceX, bodyHeight - faceY - faceHeight, faceWidth, faceHeight);

            //set scales and shifts
            const { scaleX, scaleY, shiftX, shiftY } = this.calculateRectTransform(
                faceX, faceY, faceWidth, faceHeight, bodyWidth, bodyHeight
            );

            gl.uniform2f(this.uRectScale, scaleX, scaleY);
            gl.uniform2f(this.uRectShift, shiftX, shiftY);
        }
        else
        {
            gl.enable(gl.SCISSOR_TEST);
            gl.scissor(0, 0, canvas.width, canvas.height);

            let scaleX = 1.0;
            let scaleY = 1.0;
            let shiftX = 0.0;
            let shiftY = 0.0;
            gl.uniform2f(this.uRectScale, scaleX, scaleY);
            gl.uniform2f(this.uRectShift, shiftX, shiftY);

            let transforms = this.global_transform ? this.global_transform : [1.0, 1.0, 0.0, 0.0];
            const [ gscaleX, gscaleY, gshiftX, gshiftY ] = transforms;
            gl.uniform2f(this.uGlobalScale, gscaleX, gscaleY);
            gl.uniform2f(this.uGlobalShift, gshiftX, gshiftY);
        }

    }
    draw0(bitmap, idx1, mode, idx2=-1, ip_alpha=1.0) {

        if(bitmap == null)
        {
            return;
        }
        let alpha=1.0; // avoid name conflict
        let flipY=0.0;

        const gl = this.gl;
        this.setScissor(mode);

        let bid;
        let animation_kp;

        // if(idx1 > 0)
        // {
        //     ip_alpha = 0.5;
        //     idx2 = Math.max(0, idx1 - 1);
        // }
        

        if(ip_alpha == 1.0)
        {
            let animId = 0;
            bid = idx1 < 0 ? idx1 : this.dataManager.get_idx(idx1, mode, animId);
            animation_kp = this.dataManager.get_animation_data('AK.png', animId, idx1); // Shape: [249, 3]
        }
        else if(ip_alpha == 0.0)
        {
            let animId = 1;
            bid = idx2 < 0 ? idx2 : this.dataManager.get_idx(idx2, mode, animId);
            animation_kp = this.dataManager.get_animation_data('AK.png', animId, idx2); // Shape: [249, 3]
        }
        else
        {
            if(idx1 < 0 || idx2 < 0)
            {
                console.error("idx1 and idx2 should be set.");
                return;
            }
            
            bid = this.dataManager.get_idx_interpolated(idx1, idx2, mode, ip_alpha);
            let animation_kp1 = this.dataManager.get_animation_data('AK.png', 0, idx1); // Shape: [249, 3]
            let animation_kp2 = this.dataManager.get_animation_data('AK.png', 1, idx2); // Shape: [249, 3]
            animation_kp = animation_kp1.multiply(ip_alpha).add(animation_kp2.multiply(1.0 - ip_alpha));
        }
        
        
        this.prepareDataTextures(bid, mode, animation_kp);

        gl.activeTexture(gl.TEXTURE3);
        this.updateImageTexture(bitmap);
        //gl.bindTexture(gl.TEXTURE_2D, this.texture0);
        gl.uniform1i(this.uTexture0, 3);

        // Set alpha value if needed
        //gl.uniform1f(this.uHeight, height); // Adjust as needed
        gl.uniform1f(this.uFlipY, flipY); // Adjust as needed
        gl.uniform1f(this.uAlpha0, alpha); // Adjust as needed
        
        // Draw the scene
        gl.drawElements(gl.TRIANGLES, this.gridData.indices.length, gl.UNSIGNED_SHORT, 0);

        gl.disable(gl.SCISSOR_TEST);
    }

    draw_smooth(idx) {

        let mode=3;
        let alpha=0.50;
        let flipY=1.0;

        this.setScissor(mode);
        this.prepareDataTextures(idx, mode); //animId = undefined
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE4);
        //this.updateImageTexture(bitmap);
        gl.bindTexture(gl.TEXTURE_2D, this.prevTexture);
        gl.uniform1i(this.uTexture0, 4);
        //gl.uniform1f(this.uHeight, height); // Adjust as needed
        gl.uniform1f(this.uFlipY, flipY); // Adjust as needed
        gl.uniform1f(this.uAlpha0, alpha); // Adjust as needed
        gl.drawElements(gl.TRIANGLES, this.gridData.indices.length, gl.UNSIGNED_SHORT, 0);
        gl.disable(gl.SCISSOR_TEST);
    }

    drawBG(bitmap=null) {

        let idx=-1;
        let mode=4;
        let alpha=1.0;
        let flipY=0.0;

        const gl = this.gl;
        this.setScissor(mode);

        this.prepareDataTextures(idx, mode); //animId = undefined

        gl.activeTexture(gl.TEXTURE5);
        
        if(bitmap == null)
        {
            gl.bindTexture(gl.TEXTURE_2D, this.textureBG);
        }
        else{
            this.updateImageTextureBG(bitmap);
        }
        gl.uniform1i(this.uTexture0, 5);

        // Set alpha value if needed
        //gl.uniform1f(this.uHeight, height); // Adjust as needed
        gl.uniform1f(this.uFlipY, flipY); // Adjust as needed
        gl.uniform1f(this.uAlpha0, alpha); // Adjust as needed
        
        // Draw the scene
        gl.drawElements(gl.TRIANGLES, this.gridData.indices.length, gl.UNSIGNED_SHORT, 0);

        gl.disable(gl.SCISSOR_TEST);
    }

    copyCanvasToTexture(targetTexture) {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, targetTexture);
        gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, gl.canvas.width, gl.canvas.height, 0);
    }
    
    // copyCanvasToTexture(targetTexture) {
    //     const gl = this.gl;
    //     gl.bindTexture(gl.TEXTURE_2D, targetTexture);
    //     // Flip the Y-axis before copying the canvas to texture
    //     gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    //     gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, gl.canvas.width, gl.canvas.height, 0);
    //     // Reset the flip state
    //     gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    // }

    draw(bitmap=null, bitmap2=null, bitmap3=null, idx1=-1, idx2=-1, ip_alpha=1.0) {
        //console.log("Child Draw");
        const gl = this.gl;

        // Determine dimensions based on the input type
        // const width = bitmap.displayWidth || bitmap.width;
        // const height = bitmap.displayHeight || bitmap.height;

        // Resize canvas if necessary
        // if (this.canvas.width !== width || this.canvas.height !== height) {
        //     this.canvas.width = width;
        //     this.canvas.height = height;
        //     gl.viewport(0, 0, width, height);
        // }
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.useProgram(this.shaderProgram);
        
        // Update the image texture with the new frame
        
        // Bind the image texture to a texture unit and set the uniform
        //this.prepareDataTextures(idx);
        
        // Clear the canvas
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        // Bind the image texture to a texture unit and set the uniform
        if(this.textureBG)
        {
            //this.drawBG();
        }
        else
        {
            //console.warn("BG texture is not set.");
        }       
        
        
        //The order is important, should be BG -> pose -> bottom -> top
        if (bitmap3 != null)
        {
            this.draw0(bitmap3, idx1, 2, idx2, ip_alpha); //pose_card
        }

        if (bitmap2 != null)
        {
            //this.draw0(bitmap2, idx1, 1, idx2, ip_alpha); //bottom_card
        }

        if(bitmap != null)
        {
            //this.draw0(bitmap, idx1, 0, idx2, ip_alpha); //top_card
        }
        
        //This should only smooth face region, and make it weaker.
        // if(idx >= 0)
        // {
        //     if(this.prevTexture != null)
        //     {
        //         this.draw_smooth(idx, 3);
        //     }
        //     else{
        //         gl.activeTexture(gl.TEXTURE4);
        //         this.prevTexture = this.createTexture(null, gl.canvas.width, gl.canvas.height);
        //         gl.uniform1i(this.uTexture0, 4);
        //     }

        //     gl.activeTexture(gl.TEXTURE4);
        //     this.copyCanvasToTexture(this.prevTexture);
        // }

         // If it's a VideoFrame, close it to free resources
        if (typeof VideoFrame !== 'undefined') {
            if (bitmap instanceof VideoFrame) {
                bitmap.close();
            }
            if (bitmap2 instanceof VideoFrame) {
                bitmap2.close();
            }
            if (bitmap3 instanceof VideoFrame) {
                bitmap3.close();
            }
        }
    }
}
