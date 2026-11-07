import * as T from 'three';
/** Depth-aware ray marching; fog lives in world space and stops at opaque geometry. */
export class WorldFog {
  private sceneTarget = new T.WebGLRenderTarget(1, 1, { depthBuffer: true });
  private screen = new T.Scene();
  private camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: T.ShaderMaterial;
  constructor() {
    this.sceneTarget.depthTexture = new T.DepthTexture(1, 1, T.UnsignedIntType);
    this.material = new T.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        colorMap: { value: this.sceneTarget.texture },
        depthMap: { value: this.sceneTarget.depthTexture },
        inverseProjection: { value: new T.Matrix4() },
        cameraWorld: { value: new T.Matrix4() },
        eye: { value: new T.Vector3() },
        time: { value: 0 },
        density: { value: 0.48 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
      fragmentShader: `precision highp float;
        uniform sampler2D colorMap, depthMap; uniform mat4 inverseProjection,cameraWorld;
        uniform vec3 eye; uniform float time,density; varying vec2 vUv;
        float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
        float noise(vec3 p){vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
        void main(){
          vec4 base=texture2D(colorMap,vUv); float d=texture2D(depthMap,vUv).x;
          vec4 view=inverseProjection*vec4(vUv*2.0-1.0,d*2.0-1.0,1.0); view/=view.w;
          vec3 end=(cameraWorld*view).xyz; vec3 delta=end-eye;
          float lengthRay=min(length(delta),55.0); vec3 direction=normalize(delta);
          float stepLength=lengthRay/24.0; float transmittance=1.0; vec3 scatter=vec3(0.0);
          for(int i=0;i<24;i++){
            vec3 p=eye+direction*((float(i)+.5)*stepLength);
            float inside=step(abs(p.x),5.8)*step(p.z,-.2)*step(-20.0,p.z);
            float heightFall=exp(-max(p.y,0.0)*.67);
            float n=noise(p*.32+vec3(time*.021,0.0,time*.016)); n=mix(n,noise(p*.83-vec3(time*.03)),.25);
            float rho=density*(.7+.14*sin(time*.42))*(.025+.115*heightFall*n)*mix(1.0,.2,inside);
            float a=1.0-exp(-rho*stepLength);
            float spot=exp(-dot(p.xz-vec2(0.0,-13.5),p.xz-vec2(0.0,-13.5))*.25)*inside;
            float door=exp(-dot(p.xz,p.xz)*.13)*(1.0-inside);
            vec3 fogColor=mix(vec3(.29,.36,.39),vec3(.52,.56,.51),inside)+vec3(.32,.31,.25)*(spot+door*.25);
            scatter+=transmittance*a*fogColor; transmittance*=1.0-a;
          }
          gl_FragColor=vec4(base.rgb*transmittance+scatter,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.screen.add(new T.Mesh(new T.PlaneGeometry(2, 2), this.material));
  }
  resize(w: number, h: number) {
    this.sceneTarget.setSize(w, h);
  }
  render(renderer: T.WebGLRenderer, scene: T.Scene, camera: T.PerspectiveCamera, time: number, density: number) {
    const u = this.material.uniforms;
    u.inverseProjection.value.copy(camera.projectionMatrixInverse);
    u.cameraWorld.value.copy(camera.matrixWorld);
    u.eye.value.copy(camera.position);
    u.time.value = time;
    u.density.value = density;
    renderer.setRenderTarget(this.sceneTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.screen, this.camera);
  }
  dispose() {
    this.sceneTarget.dispose();
    this.material.dispose();
    this.screen.traverse((o) => {
      if (o instanceof T.Mesh) o.geometry.dispose();
    });
  }
}
