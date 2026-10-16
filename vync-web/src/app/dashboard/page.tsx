import { onAuthenticateUser } from '@/actions/user'
import { redirect } from 'next/navigation'
import React from 'react'

type Props = {}

const DasboardPage = async (props: Props) => {
  //Authentication
  const auth = await onAuthenticateUser()
  if ((auth.status === 200 || auth.status === 201) && auth.user?.workspace?.[0]?.id) {
    return redirect(`/dashboard/${auth.user.workspace[0].id}`)
  }

  return redirect('/auth/sign-in')
}

export default DasboardPage
