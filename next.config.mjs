const nextConfig = {
 output: 'standalone',
 async headers(){return [
  {source:'/walks/:path*',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'}]},
  {source:'/api/routes/:path*',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'}]}
 ]}
};
export default nextConfig;
