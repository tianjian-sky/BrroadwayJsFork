const { exec } = require('child_process')
const fs = require('fs')
const EMCC = '~/develop/emscripten-main/emcc'

const source_files = [
    'h264bsd_transform.c',
    'h264bsd_util.c',
    'h264bsd_byte_stream.c',
    'h264bsd_seq_param_set.c',
    'h264bsd_pic_param_set.c',
    'h264bsd_slice_header.c',
    'h264bsd_slice_data.c',
    'h264bsd_macroblock_layer.c',
    'h264bsd_stream.c',
    'h264bsd_vlc.c',
    'h264bsd_cavlc.c',
    'h264bsd_nal_unit.c',
    'h264bsd_neighbour.c',
    'h264bsd_storage.c',
    'h264bsd_slice_group_map.c',
    'h264bsd_intra_prediction.c',
    'h264bsd_inter_prediction.c',
    'h264bsd_reconstruct.c',
    'h264bsd_dpb.c',
    'h264bsd_image.c',
    'h264bsd_deblocking.c',
    'h264bsd_conceal.c',
    'h264bsd_vui.c',
    'h264bsd_pic_order_cnt.c',
    'h264bsd_decoder.c',
    'H264SwDecApi.c',
    'extraFlags.c',
    'Decoder.c']

const object_files = []

let flg = 2 // 1 编译为broadway的Decoder.js文件  2  编译为云渲染sdk需要的Decoder.js文件
let num = 0

const INIT_MEMORY = 50 * 1024 * 1024
const TOTAL_MEMORY = `-sTOTAL_MEMORY=${60 * 1024 * 1024}`
const ALLOW_MEMORY_GROWTH = '-sALLOW_MEMORY_GROWTH=1'

function start() {
    exec(`${EMCC}--clear-cache`, (e, c, s) => {
        source_files.forEach(file => {
            console.log('compile:' + file)
            object_files.push('./build/' + file.replace('.c', '.o'))
            exec(`${EMCC} ${'./Decoder/src/'}${file} -O3 --memory-init-file=0 --llvm-opts=3 --llvm-lto=3 -c -o ./build/${file.replace('.c', '.o')} -IDecoder/src -IDecoder/inc`, (a, b, c) => {
                num++
                if (num == source_files.length) {
                    setTimeout(() => link(), 2000)
                }
            })
        })

    })
}

function link() {
    console.log('link')
    exec(`${EMCC} ${object_files.join(' ')} --memory-init-file=1  -o ./build/avc.js   -sFILESYSTEM=0  -sINVOKE_RUN=0 -sDOUBLE_MODE=0 -sAGGRESSIVE_VARIABLE_ELIMINATION=1 -sALIASING_FUNCTION_POINTERS=1 -sDISABLE_EXCEPTION_CATCHING=1 ${ALLOW_MEMORY_GROWTH}   -sEXPORTED_FUNCTIONS=_broadwayGetMajorVersion,_broadwayGetMinorVersion,_broadwayInit,_broadwayExit,_broadwayCreateStream,_broadwayPlayStream,_broadwayOnHeadersDecoded,_broadwayOnPictureDecoded,_broadwayFreeStreamBuffer -sINITIAL_MEMORY=${INIT_MEMORY} --js-library ./Decoder/library.js `, (e, c, s) => {
        // console.log(`${EMCC} ${object_files.join(' ')} -o ./build/avc.bc`)
        console.log(2, e, c, s)
        getDecoderJs()
    })
}

async function getDecoderJs() {
    console.log('copy files')
    let output = ''
    const pre = fs.readFileSync('./templates/DecoderPre.js')
    let preStr = pre.toString()
    if (flg == 2) {
        // preStr = preStr.slice(544)
        preStr = preStr.replace(/[\s|\S|\r|\n]*?this\W+function[^{]+\{/g, function (a) {
            return ''
        })
        preStr = preStr.replace(`function error(`, 'export function error(')
        preStr = preStr.replace(`function assert(`, 'export function assert(')
        preStr = preStr.replace('getModule = function(par_broadwayOnHeadersDecoded, par_broadwayOnPictureDecoded){', 'getModule = function(par_broadwayOnHeadersDecoded, par_broadwayOnPictureDecoded, wasmUrl){')
    }
    output = output + preStr
    const avc = fs.readFileSync('./build/avc.js')
    let avcStr = avc.toString()
    avcStr = avcStr.replace('require(', '(null)(')
    avcStr = avcStr.replace('typeof require', 'typeof null')
    if (flg == 2) {
        avcStr = avcStr.replace('return scriptDirectory + path;', 'return path;')
        avcStr = avcStr.replace('wasmBinaryFile = \'avc.wasm\';', 'wasmBinaryFile = wasmUrl')
        avcStr = avcStr.replace('require(\'fs\')', '(null)(\'fs\')')
        avcStr = avcStr.replace('require(\'path\')', '(null)(\'path\')')
    }
    if (ALLOW_MEMORY_GROWTH) {
        avcStr = avcStr.replace(/(?<=function\s+emscripten_realloc_buffer[\s|\S|\r|\n]*?)updateMemoryViews\(\);/g, function (a, b, c) {
            console.warn(a)
            return a + 'decoderInstance.initBuffer();'
        })
    }
    output = output + avcStr
    const post = fs.readFileSync('./templates/DecoderPost.js')
    postStr = post.toString()
    if (flg == 2) {
        postStr = postStr.replace(`return (function () {`, `export const Decoder = (function(){`)
        postStr = postStr.replace(`}, onPicFun]);`, ' }, onPicFun, parOptions.wasmUrl]);')
        postStr = postStr.replace(`1024 * 1024`, '3840 * 2160')
        postStr = postStr.replace(`}));`, '')
    }
    output += postStr
    fs.copyFileSync('./build/avc.wasm', './Player/avc.wasm')
    fs.writeFileSync('./Player/Decoder.js', output)
    // fs.copyFileSync('./build/avc.wasm', '../render_js_sdk/src/component/renderSdk/src/lib/Broadway/avc.wasm')
    // fs.copyFileSync('./build/avc.wasm', '../render_js_sdk/static/lib/Broadway/avc.wasm')
    // fs.copyFileSync('./Player/Decoder.js', '../render_js_sdk/src/component/renderSdk/src/lib/Broadway/Decoder.js')
}

start()
