#!/usr/bin/env python3
import sys
import os
import json
import math
import pickle
import pickletools
import traceback

# Optional imports handled gracefully
try:
    import numpy as np
except ImportError:
    np = None

try:
    import pandas as pd
except ImportError:
    pd = None

try:
    import torch
except ImportError:
    torch = None

try:
    from PIL import Image as PILImage
except ImportError:
    PILImage = None

# Custom Mock Class to replace unresolved pickled classes
class MockObject:
    def __init__(self, *args, **kwargs):
        self.__dict__['_args'] = args
        self.__dict__['_kwargs'] = kwargs
        self.__dict__['_attributes'] = {}

    def __setstate__(self, state):
        if '_attributes' not in self.__dict__:
            self.__dict__['_attributes'] = {}
        if isinstance(state, dict):
            self.__dict__['_attributes'].update(state)
        else:
            self.__dict__['_state_value'] = state

    def __getattr__(self, key):
        if '_attributes' not in self.__dict__:
            self.__dict__['_attributes'] = {}
        return self.__dict__['_attributes'].get(key, None)

    def __repr__(self):
        class_name = self.__dict__.get('_class_name', self.__class__.__name__)
        return f"<MockObject: {class_name}>"

# Custom Unpickler that overrides find_class to safely mock missing modules/classes
class SafeUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        try:
            return super().find_class(module, name)
        except Exception:
            # Create a dynamic subclass of MockObject with the right class name
            dynamic_name = f"Mock_{module}_{name}"
            
            class DynamicMockObject(MockObject):
                pass
                
            DynamicMockObject.__name__ = name
            DynamicMockObject.__module__ = module
            
            # Helper to let serialization know what this class originally was
            def custom_init(self, *args, **kwargs):
                super(DynamicMockObject, self).__init__(*args, **kwargs)
                self.__dict__['_class_name'] = f"{module}.{name}"
                
            DynamicMockObject.__init__ = custom_init
            return DynamicMockObject

def try_convert_pil_to_base64(img):
    if PILImage is None:
        return None
    try:
        import io
        import base64
        buffered = io.BytesIO()
        # Save as PNG
        img.save(buffered, format="PNG")
        return base64.b64encode(buffered.getvalue()).decode("utf-8")
    except Exception:
        return None

def try_convert_array_to_image_base64(arr):
    if np is None or PILImage is None:
        return None
    try:
        import io
        import base64
        
        # Scale floats from [0, 1] to [0, 255]
        if issubclass(arr.dtype.type, np.floating):
            img_arr = (np.clip(arr, 0.0, 1.0) * 255.0).astype(np.uint8)
        else:
            img_arr = np.clip(arr, 0, 255).astype(np.uint8)
            
        # Squeeze 1-channel images to 2D
        if len(img_arr.shape) == 3 and img_arr.shape[2] == 1:
            img_arr = img_arr.squeeze(axis=2)
            
        img = PILImage.fromarray(img_arr)
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        return base64.b64encode(buffered.getvalue()).decode("utf-8")
    except Exception:
        return None

def try_convert_waveform_to_wav_base64(waveform, sample_rate):
    try:
        import io
        import base64
        import wave
        import struct
        
        # Handle PyTorch Tensor conversion
        if hasattr(waveform, "detach") and hasattr(waveform, "cpu"):
            waveform = waveform.detach().cpu().numpy()
            
        if np is not None and isinstance(waveform, np.ndarray):
            # Resolve multi-channels to mono
            if len(waveform.shape) == 2:
                if waveform.shape[0] in (1, 2) and waveform.shape[1] > waveform.shape[0]:
                    waveform = waveform[0]
                elif waveform.shape[1] in (1, 2) and waveform.shape[0] > waveform.shape[1]:
                    waveform = waveform[:, 0]
                else:
                    waveform = waveform.flatten()
            elif len(waveform.shape) > 2:
                waveform = waveform.flatten()
                
            # Scale floats from [-1.0, 1.0] to signed 16-bit PCM
            if issubclass(waveform.dtype.type, np.floating):
                scaled = np.clip(waveform, -1.0, 1.0) * 32767
                pcm_data = scaled.astype(np.int16)
            else:
                pcm_data = np.clip(waveform, -32768, 32767).astype(np.int16)
            pcm_bytes = pcm_data.tobytes()
        else:
            # Fallback for standard lists
            flat_samples = []
            for sample in list(waveform):
                clipped = max(-1.0, min(1.0, float(sample)))
                flat_samples.append(int(clipped * 32767))
            pcm_bytes = struct.pack(f'<{len(flat_samples)}h', *flat_samples)
            
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, 'wb') as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(pcm_bytes)
            
        return base64.b64encode(wav_buffer.getvalue()).decode("utf-8")
    except Exception as e:
        print("WAV audio conversion failed:", e, file=sys.stderr)
        return None

def try_convert_video_to_gif_base64(video_array):
    if PILImage is None:
        return None
    try:
        import io
        import base64
        
        if hasattr(video_array, "detach") and hasattr(video_array, "cpu"):
            video_array = video_array.detach().cpu().numpy()
            
        if np is None or not isinstance(video_array, np.ndarray):
            return None
            
        shape = list(video_array.shape)
        if len(shape) != 4:
            return None
            
        # Detect channel ordering (Frames, Channels, Height, Width) -> transpose to (Frames, H, W, C)
        if shape[1] in (1, 3, 4) and shape[3] > 4:
            video_array = np.transpose(video_array, (0, 2, 3, 1))
            shape = list(video_array.shape)
            
        num_frames, H, W, C = shape
        max_frames = min(num_frames, 50)  # limit frame size to protect webview memory
        
        frames = []
        for i in range(max_frames):
            frame = video_array[i]
            if issubclass(frame.dtype.type, np.floating):
                scaled_frame = (np.clip(frame, 0.0, 1.0) * 255.0).astype(np.uint8)
            else:
                scaled_frame = np.clip(frame, 0, 255).astype(np.uint8)
                
            if C == 1:
                scaled_frame = scaled_frame.squeeze(axis=2)
                img = PILImage.fromarray(scaled_frame, mode="L")
            elif C == 3:
                img = PILImage.fromarray(scaled_frame, mode="RGB")
            elif C == 4:
                img = PILImage.fromarray(scaled_frame, mode="RGBA")
            else:
                continue
            frames.append(img)
            
        if not frames:
            return None
            
        buffered = io.BytesIO()
        frames[0].save(
            buffered,
            format="GIF",
            save_all=True,
            append_images=frames[1:],
            duration=100,  # 10 FPS
            loop=0
        )
        return base64.b64encode(buffered.getvalue()).decode("utf-8")
    except Exception as e:
        print("Video GIF compilation failed:", e, file=sys.stderr)
        return None

def try_convert_matplotlib_to_base64(fig):
    try:
        import io
        import base64
        buffered = io.BytesIO()
        fig.savefig(buffered, format="PNG", bbox_inches='tight')
        return base64.b64encode(buffered.getvalue()).decode("utf-8")
    except Exception as e:
        print("Matplotlib Figure render failed:", e, file=sys.stderr)
        return None

def try_parse_wav_sample_rate(wav_bytes):
    try:
        import struct
        if wav_bytes.startswith(b'RIFF') and wav_bytes[8:12] == b'WAVE':
            offset = 12
            while offset < len(wav_bytes) - 8:
                chunk_id = wav_bytes[offset:offset+4]
                chunk_size = struct.unpack('<I', wav_bytes[offset+4:offset+8])[0]
                if chunk_id == b'fmt ':
                    sample_rate = struct.unpack('<I', wav_bytes[offset+12:offset+16])[0]
                    return sample_rate
                offset += 8 + chunk_size
    except Exception:
        pass
    return None

def detect_media_type_from_bytes(data):
    if not isinstance(data, (bytes, bytearray)):
        return None
    if len(data) < 12:
        return None
        
    # Image Magic Bytes
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if data.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if data.startswith(b'GIF87a') or data.startswith(b'GIF89a'):
        return 'image/gif'
    if data.startswith(b'RIFF') and data[8:12] == b'WEBP':
        return 'image/webp'
    if data.startswith(b'BM'):
        return 'image/bmp'
        
    # Audio Magic Bytes
    if data.startswith(b'RIFF') and data[8:12] == b'WAVE':
        return 'audio/wav'
    if data.startswith(b'ID3') or data.startswith(b'\xff\xfb') or data.startswith(b'\xff\xf3') or data.startswith(b'\xff\xf2'):
        return 'audio/mp3'
    if data.startswith(b'OggS'):
        return 'audio/ogg'
        
    # Video Magic Bytes
    if len(data) >= 8 and data[4:8] == b'ftyp':
        return 'video/mp4'
    if data.startswith(b'\x1a\x45\xdf\xa3'):
        return 'video/webm'
        
    return None

def serialize_value(val, max_list_len, max_df_rows, current_depth=0, max_depth=10):
    if current_depth > max_depth:
        return {
            "__pkl_type__": "truncated",
            "repr": repr(val)
        }
    
    # Handle primitives
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        if isinstance(val, float):
            if math.isnan(val):
                return "NaN"
            if math.isinf(val):
                return "Infinity" if val > 0 else "-Infinity"
        return val
    if isinstance(val, str):
        # 1. Check if it's a Data URI
        if val.startswith("data:") and ";base64," in val:
            try:
                header, base64_str = val.split(";base64,", 1)
                mime = header.split("data:", 1)[1]
                if mime.startswith("image/"):
                    img_size = [0, 0]
                    if PILImage is not None:
                        try:
                            import base64
                            import io
                            img_data = base64.b64decode(base64_str)
                            with PILImage.open(io.BytesIO(img_data)) as temp_img:
                                img_size = list(temp_img.size)
                        except Exception:
                            pass
                    return {
                        "__pkl_type__": "image",
                        "format": mime.split("/")[1].upper() if "/" in mime else "PNG",
                        "size": img_size,
                        "image": base64_str,
                        "is_raw_bytes": False,
                        "is_base64_str": True
                    }
                elif mime.startswith("audio/"):
                    sample_rate = None
                    if mime == "audio/wav":
                        try:
                            import base64
                            img_data = base64.b64decode(base64_str)
                            sample_rate = try_parse_wav_sample_rate(img_data)
                        except Exception:
                            pass
                    return {
                        "__pkl_type__": "audio",
                        "format": mime.split("/")[1].upper() if "/" in mime else "WAV",
                        "audio": base64_str,
                        "sample_rate": sample_rate,
                        "is_raw_bytes": False,
                        "is_base64_str": True
                    }
                elif mime.startswith("video/"):
                    return {
                        "__pkl_type__": "video",
                        "format": mime.split("/")[1].upper() if "/" in mime else "MP4",
                        "video": base64_str,
                        "is_raw_bytes": True,
                        "is_base64_str": True
                    }
            except Exception:
                pass

        # 2. Check if it's a raw base64 encoded media string
        if len(val) >= 32 and all(c.isalnum() or c in '+/=' for c in val[:100]):
            try:
                import base64
                check_bytes = base64.b64decode(val[:200].encode('utf-8'))
                media_mime = detect_media_type_from_bytes(check_bytes)
                if media_mime:
                    full_bytes = base64.b64decode(val.encode('utf-8'))
                    media_mime = detect_media_type_from_bytes(full_bytes)
                    if media_mime:
                        if media_mime.startswith("image/"):
                            img_size = [0, 0]
                            if PILImage is not None:
                                try:
                                    import io
                                    with PILImage.open(io.BytesIO(full_bytes)) as temp_img:
                                        img_size = list(temp_img.size)
                                except Exception:
                                    pass
                            return {
                                "__pkl_type__": "image",
                                "format": media_mime.split("/")[1].upper() if "/" in media_mime else "PNG",
                                "size": img_size,
                                "image": val,
                                "is_raw_bytes": False,
                                "is_base64_str": True
                            }
                        elif media_mime.startswith("audio/"):
                            sample_rate = None
                            if media_mime == 'audio/wav':
                                sample_rate = try_parse_wav_sample_rate(full_bytes)
                            return {
                                "__pkl_type__": "audio",
                                "format": media_mime.split("/")[1].upper() if "/" in media_mime else "WAV",
                                "audio": val,
                                "sample_rate": sample_rate,
                                "is_raw_bytes": False,
                                "is_base64_str": True
                            }
                        elif media_mime.startswith("video/"):
                            return {
                                "__pkl_type__": "video",
                                "format": media_mime.split("/")[1].upper() if "/" in media_mime else "MP4",
                                "video": val,
                                "is_raw_bytes": True,
                                "is_base64_str": True
                            }
            except Exception:
                pass
        return val
    if isinstance(val, (bytes, bytearray)):
        media_mime = detect_media_type_from_bytes(val)
        if media_mime:
            import base64
            base64_str = base64.b64encode(val).decode("utf-8")
            if media_mime.startswith("image/"):
                img_size = [0, 0]
                if PILImage is not None:
                    try:
                        import io
                        with PILImage.open(io.BytesIO(val)) as temp_img:
                            img_size = list(temp_img.size)
                    except Exception:
                        pass
                return {
                    "__pkl_type__": "image",
                    "format": media_mime.split("/")[1].upper() if "/" in media_mime else "PNG",
                    "size": img_size,
                    "image": base64_str,
                    "is_raw_bytes": True
                }
            elif media_mime.startswith("audio/"):
                sample_rate = None
                if media_mime == 'audio/wav':
                    sample_rate = try_parse_wav_sample_rate(val)
                return {
                    "__pkl_type__": "audio",
                    "format": media_mime.split("/")[1].upper() if "/" in media_mime else "WAV",
                    "audio": base64_str,
                    "sample_rate": sample_rate,
                    "is_raw_bytes": True
                }
            elif media_mime.startswith("video/"):
                return {
                    "__pkl_type__": "video",
                    "format": media_mime.split("/")[1].upper() if "/" in media_mime else "MP4",
                    "video": base64_str,
                    "is_raw_bytes": True
                }
        return {
            "__pkl_type__": "bytes",
            "length": len(val),
            "preview": val[:100].hex() + ("..." if len(val) > 100 else "")
        }

    # Handle custom MockObject instances from SafeUnpickler
    if isinstance(val, MockObject):
        full_class = val.__dict__.get('_class_name', 'Unknown')
        if full_class == 'Unknown' and hasattr(val, '__class__'):
            full_class = f"{val.__class__.__module__}.{val.__class__.__name__}"
            
        attrs = {}
        # 1. Grab from _attributes
        for k, v in val.__dict__.get('_attributes', {}).items():
            if not k.startswith("__"):
                attrs[str(k)] = serialize_value(v, max_list_len, max_df_rows, current_depth + 1, max_depth)
                
        # 2. Grab from standard __dict__ directly, skipping metadata keys
        for k, v in val.__dict__.items():
            if k in ('_args', '_kwargs', '_attributes', '_state_value', '_class_name'):
                continue
            if not k.startswith("__"):
                attrs[str(k)] = serialize_value(v, max_list_len, max_df_rows, current_depth + 1, max_depth)
        
        # Check for state values (if state was a list or tuple instead of dict)
        state_repr = None
        if '_state_value' in val.__dict__:
            state_repr = repr(val.__dict__['_state_value'])
            
        return {
            "__pkl_type__": "object",
            "class": full_class,
            "is_mock": True,
            "repr": f"<Unresolved Custom Class: {full_class}>",
            "attributes": attrs,
            "state_repr": state_repr
        }

    # Handle standard collections
    if isinstance(val, dict):
        # Check if it represents an audio dictionary (keys: waveform/audio, sample_rate/sr/samplerate)
        audio_key = None
        sr_key = None
        for k in val.keys():
            k_str = str(k).lower()
            val_type = type(val[k]).__name__
            if k_str in ('waveform', 'audio') and (val_type in ('ndarray', 'Tensor') or hasattr(val[k], 'shape')):
                audio_key = k
            elif k_str in ('sample_rate', 'sr', 'samplerate') and isinstance(val[k], int):
                sr_key = k

        if audio_key and sr_key:
            audio_base64 = try_convert_waveform_to_wav_base64(val[audio_key], val[sr_key])
            if audio_base64:
                serialized_dict = {}
                keys_list = list(val.keys())
                for k in keys_list:
                    if k == audio_key:
                        w = val[audio_key]
                        w_shape = list(w.shape) if hasattr(w, 'shape') else []
                        serialized_dict[str(k)] = {
                            "__pkl_type__": "audio",
                            "format": "WAV",
                            "sample_rate": val[sr_key],
                            "shape": w_shape,
                            "audio": audio_base64
                        }
                    else:
                        serialized_dict[str(k)] = serialize_value(val[k], max_list_len, max_df_rows, current_depth + 1, max_depth)
                return serialized_dict

        serialized_dict = {}
        # Avoid huge collections slowing down the initial render
        keys_list = list(val.keys())
        truncated = len(keys_list) > max_list_len
        for k in keys_list[:max_list_len]:
            serialized_dict[str(k)] = serialize_value(val[k], max_list_len, max_df_rows, current_depth + 1, max_depth)
        if truncated:
            serialized_dict["__pkl_truncated__"] = True
            serialized_dict["__pkl_total_keys__"] = len(keys_list)
        return serialized_dict

    if isinstance(val, (list, tuple, set)):
        tname = type(val).__name__
        val_list = list(val)
        
        # Check if it represents an audio tuple (waveform, sample_rate)
        if isinstance(val, tuple) and len(val) == 2:
            w = val[0]
            sr = val[1]
            w_type = type(w).__name__
            if (w_type in ('ndarray', 'Tensor') or hasattr(w, 'shape')) and isinstance(sr, int) and 4000 <= sr <= 48000:
                audio_base64 = try_convert_waveform_to_wav_base64(w, sr)
                if audio_base64:
                    return {
                        "__pkl_type__": "audio",
                        "format": "WAV",
                        "sample_rate": sr,
                        "shape": list(w.shape) if hasattr(w, 'shape') else [],
                        "audio": audio_base64
                    }

        return {
            "__pkl_type__": tname,
            "length": len(val),
            "values": [serialize_value(x, max_list_len, max_df_rows, current_depth + 1, max_depth) for x in val_list[:max_list_len]]
        }

    # Handle NumPy Ndarray
    if np is not None and isinstance(val, np.ndarray):
        shape = list(val.shape)
        dtype = str(val.dtype)
        size = int(val.size)
        
        summary = {}
        preview = []
        if issubclass(val.dtype.type, (np.number, np.bool_)):
            try:
                preview = val.flat[:100].tolist()
                # Remove NaN/Inf floats before json serializing summary stats
                if size > 0:
                    v_min = val.min()
                    v_max = val.max()
                    v_mean = val.mean()
                    summary = {
                        "min": float(v_min) if not np.isnan(v_min) and not np.isinf(v_min) else str(v_min),
                        "max": float(v_max) if not np.isnan(v_max) and not np.isinf(v_max) else str(v_max),
                        "mean": float(v_mean) if not np.isnan(v_mean) and not np.isinf(v_mean) else str(v_mean)
                    }
            except Exception:
                pass
        else:
            preview = [repr(x) for x in val.flat[:100]]
            
        # Detect if it's an image or video
        image_base64 = None
        video_base64 = None
        if len(shape) in (2, 3) and size > 0:
            is_img = False
            if len(shape) == 2 and shape[0] > 10 and shape[1] > 10:
                is_img = True
            elif len(shape) == 3 and shape[2] in (1, 3, 4) and shape[0] > 10 and shape[1] > 10:
                is_img = True
                
            if is_img and val.dtype in (np.uint8, np.float32, np.float64):
                image_base64 = try_convert_array_to_image_base64(val)
        elif len(shape) == 4 and size > 0:
            video_base64 = try_convert_video_to_gif_base64(val)
                
        if video_base64:
            return {
                "__pkl_type__": "video",
                "shape": shape,
                "dtype": dtype,
                "size": size,
                "video": video_base64
            }

        return {
            "__pkl_type__": "ndarray",
            "shape": shape,
            "dtype": dtype,
            "size": size,
            "preview": preview,
            "summary": summary,
            "image": image_base64
        }

    # Handle Pandas DataFrame
    if pd is not None and isinstance(val, pd.DataFrame):
        shape = list(val.shape)
        columns = [str(c) for c in val.columns]
        dtypes = {str(c): str(t) for c, t in val.dtypes.items()}
        index_vals = [str(i) for i in val.index[:max_df_rows]]
        
        preview_rows = []
        try:
            sub_df = val.head(max_df_rows)
            preview_rows = sub_df.values.tolist()
            preview_rows = [[serialize_value(cell, max_list_len, max_df_rows, current_depth + 1, max_depth) for cell in row] for row in preview_rows]
        except Exception:
            pass
            
        stats = {}
        try:
            # Build statistics for numerical columns
            desc = val.describe()
            for col in desc.columns:
                stats[str(col)] = {str(k): (float(v) if not pd.isna(v) and not np.isinf(v) else str(v)) for k, v in desc[col].items()}
        except Exception:
            pass
            
        return {
            "__pkl_type__": "dataframe",
            "shape": shape,
            "columns": columns,
            "dtypes": dtypes,
            "index": index_vals,
            "preview": preview_rows,
            "stats": stats
        }

    # Handle PyTorch Tensor
    if torch is not None and isinstance(val, torch.Tensor):
        shape = list(val.shape)
        dtype = str(val.dtype)
        device = str(val.device)
        requires_grad = bool(val.requires_grad)
        
        try:
            arr = val.detach().cpu().numpy()
            serialized_arr = serialize_value(arr, max_list_len, max_df_rows, current_depth, max_depth)
            serialized_arr["__pkl_type__"] = "tensor"
            serialized_arr["device"] = device
            serialized_arr["requires_grad"] = requires_grad
            return serialized_arr
        except Exception:
            return {
                "__pkl_type__": "tensor",
                "shape": shape,
                "dtype": dtype,
                "device": device,
                "requires_grad": requires_grad,
                "preview": []
            }

    # Handle PIL Image
    if PILImage is not None and isinstance(val, PILImage.Image):
        image_base64 = try_convert_pil_to_base64(val)
        return {
            "__pkl_type__": "image",
            "format": getattr(val, "format", "PNG"),
            "size": list(val.size),
            "image": image_base64
        }

    # Handle Matplotlib Figure
    if type(val).__name__ == "Figure" or (hasattr(val, "savefig") and hasattr(val, "bbox")):
        plot_base64 = try_convert_matplotlib_to_base64(val)
        if plot_base64:
            return {
                "__pkl_type__": "plot",
                "width": float(val.bbox.width) if hasattr(val, "bbox") else 600,
                "height": float(val.bbox.height) if hasattr(val, "bbox") else 400,
                "image": plot_base64
            }

    # Handle PyTorch Modules
    if type(val).__name__ == "Module" or (hasattr(val, "named_children") and hasattr(val, "parameters")):
        submodules = {}
        try:
            for name, child in val.named_children():
                submodules[str(name)] = {
                    "class": f"{type(child).__module__}.{type(child).__name__}",
                    "params_count": sum(p.numel() for p in child.parameters())
                }
        except Exception:
            pass
            
        params = {}
        try:
            for name, param in val.named_parameters(recurse=False):
                params[str(name)] = {
                    "shape": list(param.shape),
                    "dtype": str(param.dtype),
                    "requires_grad": bool(param.requires_grad)
                }
        except Exception:
            pass
            
        total_p = 0
        try:
            total_p = sum(p.numel() for p in val.parameters())
        except Exception:
            pass

        return {
            "__pkl_type__": "model",
            "framework": "pytorch",
            "class": f"{type(val).__module__}.{type(val).__name__}",
            "total_params": total_p,
            "submodules": submodules,
            "parameters": params,
            "attributes": serialize_value(val.__dict__, max_list_len, max_df_rows, current_depth + 1, max_depth) if hasattr(val, "__dict__") else {}
        }

    # Handle Scikit-Learn Estimators
    if hasattr(val, "get_params") and hasattr(val, "fit"):
        learned_params = {}
        if hasattr(val, "__dict__"):
            for k, v in val.__dict__.items():
                if k.endswith("_") and not k.startswith("__"):
                    learned_params[str(k)] = serialize_value(v, max_list_len, max_df_rows, current_depth + 1, max_depth)
                    
        return {
            "__pkl_type__": "model",
            "framework": "scikit-learn",
            "class": f"{type(val).__module__}.{type(val).__name__}",
            "learned_parameters": learned_params,
            "attributes": serialize_value(val.__dict__, max_list_len, max_df_rows, current_depth + 1, max_depth) if hasattr(val, "__dict__") else {}
        }

    # Custom Class Fallback
    module_name = getattr(type(val), "__module__", "")
    class_name = getattr(type(val), "__name__", "")
    full_class = f"{module_name}.{class_name}" if module_name else class_name
    
    attrs = {}
    if hasattr(val, "__dict__"):
        for k, v in val.__dict__.items():
            if not k.startswith("__"):
                attrs[str(k)] = serialize_value(v, max_list_len, max_df_rows, current_depth + 1, max_depth)
                
    return {
        "__pkl_type__": "object",
        "class": full_class,
        "repr": repr(val),
        "attributes": attrs
    }

def scan_pickle(file_path):
    """
    Statically analyzes the pickle byte-stream using pickletools to extract imports
    and check for code execution opcodes without executing them.
    """
    imported_modules = set()
    has_execution_opcodes = False
    file_size = os.path.getsize(file_path)
    
    try:
        with open(file_path, 'rb') as f:
            pickle_bytes = f.read()
            
        for opcode, arg, pos in pickletools.genops(pickle_bytes):
            if opcode.name in ('GLOBAL', 'STACK_GLOBAL'):
                if arg:
                    # arg is a string like "module_name class_name" for GLOBAL
                    imported_modules.add(arg)
                else:
                    # STACK_GLOBAL arguments are popped from stack
                    imported_modules.add("<dynamic stack global>")
            if opcode.name in ('REDUCE', 'BUILD', 'NEWOBJ', 'NEWOBJ_EX', 'INST', 'OBJ'):
                has_execution_opcodes = True
    except Exception as e:
        # Fallback if pickletools fails to parse (e.g. truncated file)
        return {
            "success": False,
            "error": f"Static analysis failed: {str(e)}",
            "file_size": file_size,
            "imports": [],
            "has_execution_opcodes": True  # Assume true for safety on parse error
        }
        
    return {
        "success": True,
        "file_size": file_size,
        "imports": sorted(list(imported_modules)),
        "has_execution_opcodes": has_execution_opcodes
    }

def load_pickle(file_path, max_list_len, max_df_rows):
    """
    Loads and serializes the full contents of the pickle file safely.
    """
    if not os.path.exists(file_path):
        return {"error": f"File does not exist: {file_path}"}
        
    try:
        with open(file_path, 'rb') as f:
            unpickler = SafeUnpickler(f)
            loaded_data = unpickler.load()
            
        serialized = serialize_value(loaded_data, max_list_len, max_df_rows)
        return {
            "success": True,
            "data": serialized
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }

def traverse_path(obj, path_list):
    """
    Traverses an object down a list of path keys.
    """
    current = obj
    for key in path_list:
        if isinstance(current, dict):
            if key in current:
                current = current[key]
            elif str(key) in current:
                current = current[str(key)]
            elif isinstance(key, str) and key.isdigit() and int(key) in current:
                current = current[int(key)]
            else:
                raise KeyError(f"Key '{key}' not found in dictionary.")
        elif isinstance(current, (list, tuple, set)):
            current = list(current)[int(key)]
        elif hasattr(current, "__dict__") and key in current.__dict__:
            current = current.__dict__[key]
        elif hasattr(current, key):
            current = getattr(current, key)
        else:
            # Try our MockObject attributes
            if isinstance(current, MockObject) and '_attributes' in current.__dict__ and key in current.__dict__['_attributes']:
                current = current.__dict__['_attributes'][key]
            else:
                raise ValueError(f"Cannot traverse key '{key}' on object of type '{type(current).__name__}'")
    return current

def load_sub_path(file_path, path_str, max_list_len, max_df_rows):
    """
    Loads the pickle file and extracts just the sub-object at the target JSON path.
    """
    try:
        path_list = json.loads(path_str)
        with open(file_path, 'rb') as f:
            unpickler = SafeUnpickler(f)
            loaded_data = unpickler.load()
            
        sub_obj = traverse_path(loaded_data, path_list)
        serialized = serialize_value(sub_obj, max_list_len, max_df_rows)
        return {
            "success": True,
            "data": serialized
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Pickle Viewer Python Backend Helper")
    parser.add_argument("--action", choices=["scan", "load", "get_path"], required=True, help="Action to perform")
    parser.add_argument("--file", required=True, help="Path to pickle file")
    parser.add_argument("--path", help="JSON string representing sub-path to load (required for 'get_path')")
    parser.add_argument("--max-list-len", type=int, default=100, help="Max list items to serialize")
    parser.add_argument("--max-df-rows", type=int, default=100, help="Max DataFrame rows to serialize")
    
    args = parser.parse_args()
    
    # Verify file existence
    if not os.path.exists(args.file):
        print(json.dumps({"success": False, "error": f"File not found: {args.file}"}))
        sys.exit(1)
        
    if args.action == "scan":
        result = scan_pickle(args.file)
        print(json.dumps(result))
    elif args.action == "load":
        result = load_pickle(args.file, args.max_list_len, args.max_df_rows)
        print(json.dumps(result))
    elif args.action == "get_path":
        if not args.path:
            print(json.dumps({"success": False, "error": "Missing '--path' parameter for action 'get_path'"}))
            sys.exit(1)
        result = load_sub_path(args.file, args.path, args.max_list_len, args.max_df_rows)
        print(json.dumps(result))

if __name__ == "__main__":
    main()
