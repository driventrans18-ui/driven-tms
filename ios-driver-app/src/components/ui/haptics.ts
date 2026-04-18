import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { Capacitor } from '@capacitor/core'

const IS_NATIVE = Capacitor.isNativePlatform()

export async function impactLight()  { if (IS_NATIVE) await Haptics.impact({ style: ImpactStyle.Light }) }
export async function impactMedium() { if (IS_NATIVE) await Haptics.impact({ style: ImpactStyle.Medium }) }
export async function impactHeavy()  { if (IS_NATIVE) await Haptics.impact({ style: ImpactStyle.Heavy }) }
export async function selectionChanged() { if (IS_NATIVE) await Haptics.selectionChanged() }

export async function notifySuccess() { if (IS_NATIVE) await Haptics.notification({ type: NotificationType.Success }) }
export async function notifyWarning() { if (IS_NATIVE) await Haptics.notification({ type: NotificationType.Warning }) }
export async function notifyError()   { if (IS_NATIVE) await Haptics.notification({ type: NotificationType.Error }) }
