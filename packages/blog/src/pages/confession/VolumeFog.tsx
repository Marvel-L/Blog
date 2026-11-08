import { useEffect, useRef, useState } from 'react';
import { SPACE } from './sceneSpace';

const vertex = `attribute vec2 a; varying vec2 uv; void main(){uv=a*.5+.5;gl_Position=vec4(a,0.,1.);}`;
const fragment = `precision highp float; varying vec2 uv;
uniform sampler2D depthMap; uniform float t, density;
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
void main(){
 vec2 pixel=vec2(uv.x*1200.,(1.-uv.y)*850.);
 float hEnd=min(4.8,texture2D(depthMap,vec2(uv.x,1.-uv.y)).r*6.);
 float diff=(pixel.x-600.)/54.; float sum=(pixel.y-490.)/27.;
 vec2 ground=vec2((sum+diff)*.5,(sum-diff)*.5);
 float trans=1.;vec3 scatter=vec3(0.);float ds=(4.8-hEnd)/40.;
 for(int i=0;i<40;i++){
  float h=4.8-(float(i)+.5)*ds;vec3 p=vec3(ground.x+h*52./54.,h,ground.y+h*52./54.);
  float edge=smoothstep(-8.,-6.,p.x)*(1.-smoothstep(9.,10.,p.x))*smoothstep(-8.,-6.,p.z)*(1.-smoothstep(9.,10.,p.z));
  float cloud=noise(p*.6+vec3(t*.038,0.,t*.021))*.7+noise(p*1.7-vec3(t*.024,0.,t*.031))*.3;
  float rho=density*edge*exp(-max(h,0.)*.86)*smoothstep(.22,.72,cloud)*.8;
  float alpha=1.-exp(-rho*ds*1.7);
  float light=exp(-length(p.xz-vec2(3.1,-3.6))*.8)*.34;
  vec3 color=mix(vec3(.36,.48,.53),vec3(.67,.75,.77),cloud)+vec3(.33,.27,.16)*light;
  scatter+=trans*alpha*color;trans*=1.-alpha;
 }
 float opacity=(1.-trans)*smoothstep(0.,.07,uv.x)*(1.-smoothstep(.93,1.,uv.x))*smoothstep(0.,.07,uv.y)*(1.-smoothstep(.93,1.,uv.y));gl_FragColor=vec4(scatter/max(1.-trans,.0001),opacity);
}`;
/** Ray-integrated 3D density. Alpha silhouettes end each orthographic ray at the foreground object. */
export function VolumeFog({ still }: { still: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const frozen = useRef(still);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    frozen.current = still;
  }, [still]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
    if (!gl) {
      setFailed(true);
      return;
    }
    let disposed = false,
      frame = 0,
      time = 0,
      last = 0,
      depthDirty = true;
    const shaders: WebGLShader[] = [];
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      shaders.push(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error('fog shader');
      return shader;
    };
    const program = gl.createProgram()!;
    const buffer = gl.createBuffer()!;
    const texture = gl.createTexture()!;
    const depthCanvas = document.createElement('canvas');
    depthCanvas.width = SPACE.width;
    depthCanvas.height = SPACE.height;
    const ctx = depthCanvas.getContext('2d')!;
    const stamp = document.createElement('canvas');
    stamp.width = 1200;
    stamp.height = 850;
    const stampCtx = stamp.getContext('2d')!;
    try {
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('fog link');
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(program, 'a');
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const buildDepth = () => {
        if (disposed) return;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, 1200, 850);
        ctx.globalCompositeOperation = 'lighten';
        canvas.parentElement?.querySelectorAll<HTMLElement>('[data-fog-occluder]').forEach((el) => {
          const img = el.querySelector('img');
          if (!img?.complete || !img.naturalWidth) return;
          const x = parseFloat(el.style.left),
            y = parseFloat(el.style.top),
            w = parseFloat(el.style.width),
            h = parseFloat(el.style.height);
          stampCtx.clearRect(0, 0, 1200, 850);
          stampCtx.globalCompositeOperation = 'source-over';
          stampCtx.drawImage(img, x - w / 2, y - h, w, h);
          stampCtx.globalCompositeOperation = 'source-in';
          const gradient = stampCtx.createLinearGradient(0, y - h, 0, y);
          gradient.addColorStop(0, `rgb(${Math.min(255, (h / 52 / 6) * 255)},0,0)`);
          gradient.addColorStop(1, 'black');
          stampCtx.fillStyle = gradient;
          stampCtx.fillRect(0, 0, 1200, 850);
          ctx.drawImage(stamp, 0, 0);
        });
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, depthCanvas);
        depthDirty = true;
      };
      buildDepth();
      const timer = window.setTimeout(buildDepth, 800);
      const uTime = gl.getUniformLocation(program, 't'),
        uDensity = gl.getUniformLocation(program, 'density');
      const seed = Math.random() * 6;
      const draw = (now: number) => {
        if (disposed) return;
        const shouldDraw = !frozen.current || depthDirty;
        if (!frozen.current && last !== 0) time += Math.min(0.06, (now - last) / 1000);
        last = now;
        if (shouldDraw) {
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.uniform1f(uTime, time);
          gl.uniform1f(uDensity, 0.86 + 0.2 * Math.sin(time * 0.085 + seed) + 0.13 * Math.sin(time * 0.031 + seed * 2));
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          depthDirty = false;
        }
        frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        clearTimeout(timer);
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        shaders.forEach((s) => gl.deleteShader(s));
      };
    } catch {
      setFailed(true);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      shaders.forEach((s) => gl.deleteShader(s));
    }
  }, []);
  return (
    <>
      <canvas
        ref={ref}
        width={480}
        height={340}
        className="conf-volume-fog"
        data-fog="ray-marched"
        aria-hidden="true"
      />
      {failed && (
        <span className="conf-volume-warning" role="status">
          此设备未能启用体积雾
        </span>
      )}
    </>
  );
}
