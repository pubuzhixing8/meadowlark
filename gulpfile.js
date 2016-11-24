var gulp = require('gulp');
var mocha = require('gulp-mocha');
var jshint = require('gulp-jshint');
gulp.task('Tests',()=>{
    gulp.src('qa/tests-*.js',{read:false})
    .pipe(mocha({ui:'tdd'}));    
});
gulp.task('JsHint',()=>{
    gulp.src(['meadowlark.js','pubulic/js/**/*.js',
    'lib/**/*.js'])
    .pipe(jshint())
    .pipe(jshint.reporter());
});
gulp.task('aaa',()=>{
    gulp.src(['meadowlark.js','pubulic/js/**/*.js',
    'lib/**/*.js'])
    .pipe(jshint())
    .pipe(jshint.reporter());
});

